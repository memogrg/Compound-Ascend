/**
 * Core invariant validators. Each reads through the app's OWN ctx-aware reads
 * (the same functions the UI/AI use) and records a PASS/FAIL check. A "failure"
 * is an invariant violated OR an exception from a real function (the runner lets
 * exceptions propagate and marks the run failed).
 *
 * Tolerances: liquidity/flow/goal are exact to the cent (single currency, one
 * round2), so 0.01. Net worth crosses several engines that each round2, so 1
 * currency unit.
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import type { Period } from "@/modules/financial-base/types";
import { getLiquidityBalance } from "@/modules/financial-base/services/liquidity-service";
import { getMonthFlow } from "@/modules/financial-base/services/month-flow-service";
import { listLinkedMovements } from "@/modules/financial-base/services/transaction-service";
import { getControlSummary } from "@/modules/control/services/control-service";
import { getGoalDetail } from "@/modules/control/services/goal-detail-service";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import type { EventLog } from "./event-log";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const approx = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

function push(log: EventLog, name: string, ok: boolean, detail: string): void {
  log.check({ name, ok, detail });
}

export interface FlowExpectation {
  operatingIncome: number;
  operatingExpense: number;
  operatingFlow: number;
  capitalOut: number;
}

export interface EntityIds {
  incomeLineId: string;
  debtId: string;
  goalId: string;
}

/** Liquidity identity: balance == opening + income − expense − debtPayment − goalContribution. */
export async function validateLiquidity(
  ctx: AuthContext,
  expected: number,
  log: EventLog,
  phase: string,
): Promise<void> {
  const { balance } = await getLiquidityBalance(ctx);
  push(
    log,
    `liquidez · identidad del saco (${phase})`,
    approx(balance, expected, 0.01),
    `saldo=${round2(balance)} esperado=${round2(expected)}`,
  );
}

/** No double counting: the jar consumption is liquidity-neutral. */
export function validateNoDoubleCount(before: number, after: number, log: EventLog): void {
  push(
    log,
    "sin doble conteo · el consumo de frasco no mueve la liquidez",
    approx(before, after, 0.01),
    `antes=${round2(before)} después=${round2(after)}`,
  );
}

/** getMonthFlow: operating flow = operating income − operating expense; goal contribution is capital. */
export async function validateMonthFlow(
  ctx: AuthContext,
  period: Period,
  exp: FlowExpectation,
  log: EventLog,
): Promise<void> {
  const mf = await getMonthFlow(period, ctx);
  push(
    log,
    "flujo · ingreso operativo = ingreso recibido",
    approx(mf.real.operatingIncome, exp.operatingIncome, 0.01),
    `real=${round2(mf.real.operatingIncome)} esperado=${round2(exp.operatingIncome)}`,
  );
  push(
    log,
    "flujo · gasto operativo = gasto + pago de deuda",
    approx(mf.real.operatingExpense, exp.operatingExpense, 0.01),
    `real=${round2(mf.real.operatingExpense)} esperado=${round2(exp.operatingExpense)}`,
  );
  push(
    log,
    "flujo · flujo operativo = ingresos − gastos",
    approx(mf.real.operatingFlow, exp.operatingFlow, 0.01),
    `real=${round2(mf.real.operatingFlow)} esperado=${round2(exp.operatingFlow)}`,
  );
  push(
    log,
    "flujo · salida de capital = aporte a meta (no es gasto operativo)",
    approx(mf.capital.out, exp.capitalOut, 0.01),
    `real=${round2(mf.capital.out)} esperado=${round2(exp.capitalOut)}`,
  );
}

/** Goal progress: current = Σ contributions − Σ jar spends; running balance closes on it. */
export async function validateGoal(
  ctx: AuthContext,
  goalId: string,
  expectedCurrent: number,
  log: EventLog,
): Promise<void> {
  const gd = await getGoalDetail(goalId, ctx);
  if (!gd) {
    push(log, "meta · el detalle existe", false, `getGoalDetail(${goalId}) => null`);
    return;
  }
  const movementsSum = gd.movements.reduce((s, m) => s + m.amount, 0);
  const last = gd.movements.at(-1);
  push(
    log,
    "meta · acumulado = aportes − consumos",
    approx(gd.currentAmount, expectedCurrent, 0.01),
    `acumulado=${round2(gd.currentAmount)} esperado=${round2(expectedCurrent)}`,
  );
  push(
    log,
    "meta · Σ movimientos con signo = acumulado",
    approx(movementsSum, gd.currentAmount, 0.01),
    `Σmov=${round2(movementsSum)} acumulado=${round2(gd.currentAmount)}`,
  );
  // Sin movimientos (meta creada pero el mes no la tocó — estado válido, p.ej. una
  // persona demasiado pobre para aportar) pasa trivialmente: no hay "último" saldo
  // corrido que reconciliar, y la consistencia 0 = acumulado ya la cubre el check
  // anterior. Con movimientos, el saldo corrido debe cerrar en el acumulado.
  push(
    log,
    "meta · saldo corrido cierra en el acumulado",
    last ? approx(last.balance, gd.currentAmount, 0.01) : true,
    last
      ? `último=${round2(last.balance)} acumulado=${round2(gd.currentAmount)}`
      : "sin movimientos (trivial: 0 = acumulado)",
  );
}

/** Net worth identity: neto = activos − pasivos, y neto = liquidez + metas + inversiones − deudas. */
export async function validateNetWorth(ctx: AuthContext, log: EventLog): Promise<void> {
  const [rl, liq, ctrl, debtsOv, port] = await Promise.all([
    getRichLifeSummary({ precios: "cache" }, ctx),
    getLiquidityBalance(ctx),
    getControlSummary(ctx),
    getDebtsOverview({}, ctx),
    getPortfolioReport(ctx),
  ]);
  const ind = rl.snapshot.indicators;
  const goalsTotal = ctrl.goals.reduce((s, g) => s + Math.max(0, g.currentAmount), 0);
  const debtsTotal = debtsOv.debts.reduce((s, d) => s + Math.max(0, d.balance), 0);
  const portfolioValue = port.analytics.totalPortfolioValue;

  push(
    log,
    "patrimonio · identidad neto = activos − pasivos",
    approx(ind.netWorth, ind.totalAssets - ind.totalLiabilities, 1),
    `neto=${round2(ind.netWorth)} activos=${round2(ind.totalAssets)} pasivos=${round2(ind.totalLiabilities)}`,
  );
  push(
    log,
    "patrimonio · pasivos = saldo de deudas",
    approx(ind.totalLiabilities, debtsTotal, 1),
    `pasivos=${round2(ind.totalLiabilities)} deudas=${round2(debtsTotal)}`,
  );
  const composed = liq.balance + goalsTotal + portfolioValue - debtsTotal;
  push(
    log,
    "patrimonio · composición = liquidez + metas + inversiones − deudas",
    approx(ind.netWorth, composed, 1),
    `neto=${round2(ind.netWorth)} = liquidez ${round2(liq.balance)} + metas ${round2(goalsTotal)} + inversiones ${round2(portfolioValue)} − deudas ${round2(debtsTotal)} = ${round2(composed)}`,
  );
}

/** Linked integrity: every money event has its txn + specialized row; no orphans. */
export async function validateLinkedIntegrity(
  ctx: AuthContext,
  period: Period,
  ids: EntityIds,
  log: EventLog,
): Promise<void> {
  const movements = await listLinkedMovements(period, ["goal", "debt"], ctx);
  const debtMovs = movements.filter((m) => m.linkedKind === "debt");
  const goalMovs = movements.filter((m) => m.linkedKind === "goal");
  const jarSpends = goalMovs.filter((m) => m.countsInBudget === false);

  push(log, "vinculadas · 1 abono de deuda en el periodo", debtMovs.length === 1, `abonos=${debtMovs.length}`);
  push(
    log,
    "vinculadas · 2 movimientos de meta (aporte + consumo)",
    goalMovs.length === 2,
    `movimientos=${goalMovs.length}`,
  );
  push(
    log,
    "vinculadas · el consumo del frasco es off-budget",
    jarSpends.length === 1,
    `offBudget=${jarSpends.length}`,
  );

  // Specialized row + no orphan: the debt payment carries a linked transaction,
  // and every linked 'debt' transaction is backed by a debt_payments row.
  const [{ data: debtTxns }, { data: payments }] = await Promise.all([
    ctx.db.from("transactions").select("id").eq("user_id", ctx.userId).eq("linked_kind", "debt"),
    ctx.db.from("debt_payments").select("transaction_id").eq("user_id", ctx.userId).eq("debt_id", ids.debtId),
  ]);
  const txnIds = new Set((debtTxns ?? []).map((t) => t.id));
  const paidTxnIds = (payments ?? [])
    .map((p) => p.transaction_id)
    .filter((x): x is string => Boolean(x));
  const noOrphans =
    paidTxnIds.length === (debtTxns ?? []).length && paidTxnIds.every((id) => txnIds.has(id));
  push(
    log,
    "vinculadas · pago de deuda con transacción (sin huérfanas)",
    noOrphans && paidTxnIds.length === 1,
    `txnsDeuda=${(debtTxns ?? []).length} pagosConTxn=${paidTxnIds.length}`,
  );
}
