/**
 * F2 validators layered on the F1c core (liquidity/flow/goal/net-worth/no-double
 * count are reused straight from ../validators). Here: a generalized linked
 * integrity check driven by the dynamic per-month tally, a budget-adherence
 * reconciliation, and a best-effort insights refresh logged as info (coherence
 * of insights is NOT validated yet — that's a later pass).
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import type { Period } from "@/modules/financial-base/types";
import { getMonthFlow } from "@/modules/financial-base/services/month-flow-service";
import { listLinkedMovements } from "@/modules/financial-base/services/transaction-service";
import { getActiveInsights } from "@/lib/insights/insights-service";
import type { EventLog } from "../event-log";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const approx = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

function push(log: EventLog, name: string, ok: boolean, detail: string): void {
  log.check({ name, ok, detail });
}

/** Budget adherence reconciliation: getMonthFlow's `adherence.spent` must equal
 *  the budget-aware spend the runner injected this month (operating expense +
 *  capital out; jar consumption is off-budget and excluded). */
export async function validateBudgetReconciliation(
  ctx: AuthContext,
  period: Period,
  expectedBudgetAwareSpend: number,
  log: EventLog,
): Promise<void> {
  const mf = await getMonthFlow(period, ctx);
  push(
    log,
    "presupuesto · adherencia gastada = Σ gasto budget-aware del mes",
    approx(mf.adherence.spent, expectedBudgetAwareSpend, 0.01),
    `real=${round2(mf.adherence.spent)} esperado=${round2(expectedBudgetAwareSpend)}`,
  );
}

export interface LinkedExpectation {
  debtId: string | null;
  expectedDebtMovs: number;
  expectedGoalMovs: number;
  expectedJarSpends: number;
}

/** Generalized linked integrity: the count of linked movements in the period
 *  matches what the engine emitted, and every debt-linked transaction is backed
 *  by a debt_payments row (structural, all-time — no orphans). */
export async function validateLinkedIntegrityDynamic(
  ctx: AuthContext,
  period: Period,
  exp: LinkedExpectation,
  log: EventLog,
): Promise<void> {
  const movements = await listLinkedMovements(period, ["goal", "debt"], ctx);
  const debtMovs = movements.filter((m) => m.linkedKind === "debt");
  const goalMovs = movements.filter((m) => m.linkedKind === "goal");
  const jarSpends = goalMovs.filter((m) => m.countsInBudget === false);

  push(
    log,
    "vinculadas · abonos de deuda del mes = esperados",
    debtMovs.length === exp.expectedDebtMovs,
    `real=${debtMovs.length} esperado=${exp.expectedDebtMovs}`,
  );
  push(
    log,
    "vinculadas · movimientos de meta del mes = esperados",
    goalMovs.length === exp.expectedGoalMovs,
    `real=${goalMovs.length} esperado=${exp.expectedGoalMovs}`,
  );
  push(
    log,
    "vinculadas · consumos de frasco off-budget del mes = esperados",
    jarSpends.length === exp.expectedJarSpends,
    `real=${jarSpends.length} esperado=${exp.expectedJarSpends}`,
  );

  if (exp.debtId) {
    const [{ data: debtTxns }, { data: payments }] = await Promise.all([
      ctx.db.from("transactions").select("id").eq("user_id", ctx.userId).eq("linked_kind", "debt"),
      ctx.db.from("debt_payments").select("transaction_id").eq("user_id", ctx.userId),
    ]);
    const txnIds = new Set((debtTxns ?? []).map((t) => t.id));
    const paidTxnIds = (payments ?? [])
      .map((p) => p.transaction_id)
      .filter((x): x is string => Boolean(x));
    const noOrphans =
      paidTxnIds.length === (debtTxns ?? []).length && paidTxnIds.every((id) => txnIds.has(id));
    push(
      log,
      "vinculadas · cada pago de deuda con su txn (sin huérfanas)",
      noOrphans,
      `txnsDeuda=${(debtTxns ?? []).length} pagosConTxn=${paidTxnIds.length}`,
    );
  }
}

/** Refresh + log the persona's active insights at month close. INFO only — the
 *  coherence of the insights against the state is not validated yet. */
export async function logInsights(ctx: AuthContext, log: EventLog, monthLabel: string): Promise<void> {
  const insights = await getActiveInsights(10, ctx);
  log.record("info", `insights (${monthLabel}): ${insights.length} activos`, null, {
    insights: insights.map((i) => ({ kind: i.kind, severity: i.severity, title: i.title })),
  });
}
