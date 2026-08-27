/**
 * Reconstruct a REAL FinancialContext for a sim-seeded persona at call time (under the
 * virtual clock), using the ctx-aware services + a recomputed insight + the captured
 * trajectory. buildFinancialContext itself is NOT ctx-aware (cookie session), so this
 * mirrors its assembly for the audit-relevant fields.
 *
 * FIDELITY CAVEAT (reported): numbers, net worth, debts, goals, portfolio, the 3
 * patrimonio numbers, trajectory and the low-savings insight are REAL. Omitted/approx:
 * macro indicators (external, equal for all) and biblia RAG (knowledge retrieval).
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import type { FinancialContext, ToolContext } from "@/lib/ai/orchestrator";
import type { Trajectory, MonthlyPoint, PortfolioPoint } from "@/lib/ai/trajectory";
import { getBaseSummary, getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { getPatrimonioReport } from "@/modules/wealth/services/patrimonio-service";
import { getControlSummary } from "@/modules/control/services/control-service";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getDefenseFundsReport } from "@/modules/wealth/services/fund-sizing-service";
import { detectLowSavingsRate } from "@/lib/insights/detectors";
import {
  debtLevers,
  goalLevers,
  protectionLevers,
  prioritySignal,
  expenseSobresLevers,
  debtProjections,
  fundEta,
} from "@/lib/ai/context-levers";
import { getRealTotals } from "@/modules/financial-base";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { userToday } from "@/lib/time/user-time";
import type { ContextFacts } from "./types";

const round = (n: number): number => Math.round(n);
const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface PersonaDna {
  name?: string;
  topConcern?: string;
  lifeStage?: string;
}

export interface BuiltContext {
  context: FinancialContext;
  toolContext: ToolContext;
  facts: ContextFacts;
  /** Human-readable digest for the judge — REAL numbers only, no secrets/PII. */
  digest: string;
}

export async function buildSimContext(
  ctx: AuthContext,
  trajectory: Trajectory | undefined,
  dna: PersonaDna,
  /** Serie longitudinal REAL disponible al asesor (mismos puntos de computeTrajectory /
   *  net_worth_snapshots que exponen los tools). Se funden en knownFigures para que las
   *  cifras históricas bien-fundadas no den falso positivo de grounding. */
  history?: { monthly: MonthlyPoint[]; portfolio: PortfolioPoint[] },
): Promise<BuiltContext> {
  const [currency, base, rl, port, ctrl, debtsOv, patr] = await Promise.all([
    getPrimaryCurrency(ctx),
    getBaseSummary(ctx),
    getRichLifeSummary({ precios: "cache" }, ctx),
    getPortfolioReport(ctx),
    getControlSummary(ctx),
    getDebtsOverview({}, ctx),
    getPatrimonioReport(ctx),
  ]);

  // Top sobres de gasto REAL por-hoja (para confrontar un gasto sin monto con la cifra de ESE sobre),
  // como en producción (context-engine usa getRealTotals). Best-effort; ya en moneda de visualización.
  const realTotals = await getRealTotals(await userCurrentPeriod(ctx), ctx).catch(() => null);
  const expenseSobres = realTotals
    ? expenseSobresLevers(
        Object.values(realTotals.expenseByKey).map((v) => ({ name: v.label, monthly: v.value })),
      )
    : [];

  const ind = base.indicators;
  const netWorth = rl.snapshot.indicators.netWorth;
  const pr = patr.report;
  const debts = debtsOv.debts.map((d) => ({
    name: d.name,
    balance: round2(d.balance),
    apr: d.apr,
  }));
  const topDebt = [...debtsOv.debts].sort((a, b) => b.balance - a.balance)[0];
  const goalsWithTarget = ctrl.goals.filter((g) => g.targetAmount > 0);
  const goalsProgressPct = goalsWithTarget.length
    ? round(
        (goalsWithTarget.reduce((s, g) => s + Math.min(1, g.currentAmount / g.targetAmount), 0) /
          goalsWithTarget.length) *
          100,
      )
    : 0;
  const portfolioValue = round2(port.analytics.totalPortfolioValue);

  // Defense-fund gaps for the JUDGE digest (also feeds the advisor context below).
  // Best-effort: a read failure degrades the digest, never the whole build.
  const defense = await getDefenseFundsReport(ctx).catch(() => null);

  // Palancas POR-ENTIDAD (Paso 2): las MISMAS que buildFinancialContext arma para el asesor,
  // reconstruidas acá con los mismos mappers puros. Sin esto, el asesor del audit no vería el
  // ladder/ritmo/brechas y no se podría medir el salto del contexto.
  const debtLeverResult = debtLevers(
    debtsOv.debts.map((d) => ({
      name: d.name,
      liveBalance: d.balance,
      apr: d.apr,
      minPayment: d.minPayment,
      currency: d.currency,
    })),
  );
  // Capa MENTOR (Paso 3.6): horizonte de salida de deuda con el flujo libre como extra, del engine
  // de amortización (grounded, idéntico a producción). Solo con flujo libre positivo.
  const debtProj =
    ind.freeCashflow > 0 ? debtProjections(debtLeverResult.debts, ind.freeCashflow) : [];
  // Horizonte del fondo de emergencia a tu flujo libre (Paso 3.7), del engine — como en producción.
  // Solo con flujo libre y fondo no cubierto. El aporte (=flujo libre) ya está en knownFigures.
  const fundEtaResult =
    defense && ind.freeCashflow > 0 && !defense.emergency.covered
      ? fundEta(
          { current: defense.emergency.current, target: defense.emergency.target },
          ind.freeCashflow,
          await userToday(ctx),
          currency,
        )
      : undefined;
  const goalLeverResult = goalLevers(
    ctrl.goals.map((g) => ({
      name: g.name,
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      monthlyContribution: g.monthlyContribution,
      targetDate: g.targetDate,
      currency: g.currency,
    })),
    await userToday(ctx),
  );

  const insights = detectLowSavingsRate({
    savingsRate: ind.savingsRate,
    incomeMonthly: ind.incomeMonthly,
    freeCashflow: ind.freeCashflow,
    currency,
  }).map((i) => ({ kind: i.kind, severity: i.severity, title: i.title, body: i.body }));

  const context: FinancialContext = {
    name: dna.name,
    currency,
    incomeMonthly: round(ind.incomeMonthly),
    expenseMonthly: round(ind.expenseMonthly),
    freeCashflow: round(ind.freeCashflow),
    savingsRatePct: Math.round(ind.savingsRate * 100),
    netWorth: round(netWorth),
    portfolioValueConvertido: { monto: portfolioValue, moneda: currency },
    portfolioReturnPct: round2(port.analytics.totalReturnPct * 100),
    debtCount: debtsOv.debts.length,
    topDebtName: topDebt?.name,
    topDebtApr: topDebt?.apr,
    topDebtCurrency: topDebt?.currency,
    goalCount: ctrl.goals.length,
    goalsProgressPct,
    numeroDeSeguridad: round(pr.numeroDeSeguridad),
    numeroDeIndependencia: round(pr.numeroDeIndependencia),
    numeroDeLibertad: pr.numeroDeLibertad == null ? undefined : round(pr.numeroDeLibertad),
    investableWealth: round(pr.investableWealth),
    trajectory,
    insights: insights.length ? insights : undefined,
    topConcern: dna.topConcern,
    lifeStage: dna.lifeStage,
    // Palancas por-entidad (Paso 2), idénticas al contexto de producción.
    debts: debtLeverResult.debts.length ? debtLeverResult.debts : undefined,
    debtsMoreCount: debtLeverResult.moreCount || undefined,
    goals: goalLeverResult.goals.length ? goalLeverResult.goals : undefined,
    goalsMoreCount: goalLeverResult.moreCount || undefined,
    expenseSobres: expenseSobres.length ? expenseSobres : undefined,
    debtProjections: debtProj.length ? debtProj : undefined,
    fundEta: fundEtaResult,
    protectionGaps: patr.protectionGaps.length ? protectionLevers(patr.protectionGaps) : undefined,
    activePolicies: patr.protectionGaps.length ? patr.activePolicies : undefined,
    // SEÑAL PRIORITARIA: reusa el mismo Priority Engine canónico (ctrl.diagnosis) que producción.
    señalPrioritaria: prioritySignal({
      diagnosis: ctrl.diagnosis,
      debts: debtLeverResult.debts,
      insights,
    }),
  };

  const toolContext: ToolContext = {
    debts: debtsOv.debts.map((d) => ({
      id: d.id,
      name: d.name,
      balance: round2(d.balance),
      apr: d.apr,
      minPayment: round2(d.minPayment),
    })),
    currency,
    userId: ctx.userId,
    securityNumber: round(pr.numeroDeSeguridad),
    independenceNumber: round(pr.numeroDeIndependencia),
    libertyNumber: pr.numeroDeLibertad == null ? undefined : round(pr.numeroDeLibertad),
    investableWealth: round(pr.investableWealth),
    goals: ctrl.goals.map((g) => ({
      nombre: g.name,
      objetivo: round2(g.targetAmount),
      actual: round2(g.currentAmount),
      aporte_mensual: round2(g.monthlyContribution),
    })),
  };

  const knownFigures = [
    ind.incomeMonthly,
    ind.expenseMonthly,
    Math.abs(ind.freeCashflow),
    netWorth,
    portfolioValue,
    pr.numeroDeSeguridad,
    pr.numeroDeIndependencia,
    pr.numeroDeLibertad ?? 0,
    pr.investableWealth,
    ...debts.map((d) => d.balance),
    ...ctrl.goals.flatMap((g) => [g.currentAmount, g.targetAmount]),
    // DERIVADOS de las palancas del Paso 2: sin esto, el asesor que cite "₡X/mes de interés" o
    // el ritmo requerido de una meta daría FALSO POSITIVO de grounding (no están en las cifras crudas).
    ...debtLeverResult.debts.map((d) => d.monthlyInterestCost),
    ...goalLeverResult.goals.map((g) => g.monthlyRequired ?? 0),
    // Gasto real por sobre (Paso 3.5-d): el asesor confronta un gasto sin monto citando la cifra de
    // ESE sobre; sin esto en knownFigures, esa cita daría falso positivo de grounding.
    ...expenseSobres.map((s) => s.monthly),
    // Horizonte MENTOR (Paso 3.6): el interés ahorrado que el asesor cita sale del engine; a
    // knownFigures para que citarlo no sea falso positivo (el extra = flujo libre ya está).
    ...debtProj.map((p) => p.interestSaved),
    // Longitudinal: los valores REALES mes-a-mes que el asesor legítimamente tuvo vía
    // consultar_historial (net_worth_snapshots/portfolio_snapshots) y sobre los que corre
    // computeTrajectory. Sin esto, toda cifra histórica bien-fundada (patrimonio/portafolio/
    // flujo de meses anteriores) daba falso positivo. Fuente = datos reales sembrados, no el
    // texto del asesor (el check sigue independiente: no se grada al asesor contra sí mismo).
    ...(history?.monthly ?? []).flatMap((m) => [m.income, m.expense, Math.abs(m.freeCashflow)]),
    ...(history?.portfolio ?? []).flatMap((p) => [p.portfolioValue, p.netWorth]),
  ]
    .map((n) => Math.round(Math.abs(n)))
    .filter((n) => n > 0);

  const facts: ContextFacts = {
    currency,
    incomeMonthly: round(ind.incomeMonthly),
    expenseMonthly: round(ind.expenseMonthly),
    freeCashflow: round(ind.freeCashflow),
    savingsRatePct: Math.round(ind.savingsRate * 100),
    netWorth: round(netWorth),
    netWorthTrend: trajectory?.netWorth?.dir,
    debts: debtsOv.debts.map((d) => ({ name: d.name, balance: round2(d.balance), apr: d.apr })),
    goalsProgressPct,
    portfolioValue,
    knownFigures,
  };

  const digest = [
    `Moneda: ${currency}`,
    `Ingreso mensual: ${round(ind.incomeMonthly)} · Gasto mensual: ${round(ind.expenseMonthly)} · Flujo libre: ${round(ind.freeCashflow)} · Tasa de ahorro: ${Math.round(ind.savingsRate * 100)}%`,
    `Patrimonio neto: ${round(netWorth)} · Portafolio: ${portfolioValue} (retorno ${round2(port.analytics.totalReturnPct * 100)}%)`,
    // Ladder de deuda POR-DEUDA (saldo vivo + APR + mínimo): base para que el juez pueda castigar
    // el silencio ante una deuda cara en proactividad, en vez de puntuar a ojo.
    `Deudas (${debtsOv.debts.length}): ${debtsOv.debts.map((d) => `${d.name} saldo ${round2(d.balance)} @${d.apr}% mín ${round2(d.minPayment)}`).join(" · ") || "ninguna"}`,
    // Brechas de los fondos de defensa (emergencia/paz): la otra señal dura de proactividad.
    defense
      ? `Fondos de defensa: emergencia ${round(defense.emergency.current)}/${round(defense.emergency.target)} (brecha ${round(defense.emergency.gap)}${defense.emergency.covered ? ", CUBIERTO" : ""}) · paz ${round(defense.peace.current)}/${round(defense.peace.target)} (brecha ${round(defense.peace.gap)}) · fondo activo: ${defense.activeFund}`
      : "Fondos de defensa: sin datos",
    `Metas: ${ctrl.goals.length} (progreso ${goalsProgressPct}%)`,
    `Números @8% — seguridad ${round(pr.numeroDeSeguridad)} · independencia ${round(pr.numeroDeIndependencia)} · libertad ${pr.numeroDeLibertad == null ? "s/d" : round(pr.numeroDeLibertad)}`,
    trajectory
      ? `Trayectoria (${trajectory.months} meses): ahorro ${trajectory.savingsRate?.dir ?? "s/d"} · gasto ${trajectory.expense?.dir ?? "s/d"} · patrimonio ${trajectory.netWorth?.dir ?? "s/d"}`
      : `Trayectoria: sin datos suficientes`,
    insights.length ? `Insight campana: ${insights.map((i) => i.title).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { context, toolContext, facts, digest };
}
