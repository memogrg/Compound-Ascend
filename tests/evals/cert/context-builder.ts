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
import type { Trajectory } from "@/lib/ai/trajectory";
import { getBaseSummary, getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { getPatrimonioReport } from "@/modules/wealth/services/patrimonio-service";
import { getControlSummary } from "@/modules/control/services/control-service";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { detectLowSavingsRate } from "@/lib/insights/detectors";
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

  const ind = base.indicators;
  const netWorth = rl.snapshot.indicators.netWorth;
  const pr = patr.report;
  const debts = debtsOv.debts.map((d) => ({ name: d.name, balance: round2(d.balance), apr: d.apr }));
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
    `Deudas (${debtsOv.debts.length}): ${debts.map((d) => `${d.name} ${d.balance}@${d.apr}%`).join(", ") || "ninguna"}`,
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
