import "server-only";

/**
 * Fuente canónica del "Flujo del mes" (A-01). UNA función que consumen Dashboard,
 * Mi Base, Transacciones e Inicio, reemplazando el titular que antes servían por
 * separado `getRealTotals` (real income/expense) y `getExpenseRangeView` (spent).
 * `getRealTotals` sigue vivo para sus otros consumidores (expenseByKey, donas,
 * frascos); aquí sólo se unifica el TITULAR de flujo.
 *
 * Arregla los 2 bugs del diagnóstico: (1) transferencias/ajustes ya no cuentan
 * como gasto; (2) el titular usa sólo CONFIRMADAS y los pendientes van aparte.
 * El discriminador dividendo-vs-venta usa el ledger de `dividends`.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { listTransactions } from "@/modules/financial-base/services/transaction-service";
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import {
  classifyTxnFlow,
  aggregateMonthFlow,
  type MonthFlow,
  type MonthFlowRow,
} from "@/modules/financial-base/engine/month-flow";
import type { Period, Transaction } from "@/modules/financial-base/types";

/**
 * Ids de transacciones que son DIVIDENDOS (autoridad para separar dividendo de
 * venta en `ingreso/holding`). Se acota a los candidatos del periodo; RLS acota
 * al hogar. Sin candidatos no hay query.
 */
async function getDividendTxnIds(candidateIds: string[], ctx?: AuthContext): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const { db: supabase } = await resolveAuth(ctx);
  const { data } = await supabase
    .from("dividends")
    .select("transaction_id")
    .in("transaction_id", candidateIds);
  const out = new Set<string>();
  for (const r of data ?? []) if (r.transaction_id) out.add(r.transaction_id);
  return out;
}

/** Flujo del mes canónico del periodo (ver engine/month-flow.ts para la definición). */
export async function getMonthFlow(period: Period, ctx?: AuthContext): Promise<MonthFlow> {
  const [txns, currency, rates, budget, base] = await Promise.all([
    listTransactions(period, {}, undefined, ctx), // SIN capar: el titular debe ser exacto
    getDisplayCurrency(ctx),
    getFxRates(),
    getBudgetTotals(period, ctx),
    getBaseSummary(ctx), // plan (computeBaseIndicators)
  ]);

  // Candidatos del caso ambiguo: ingreso vinculado a holding (dividendo o venta).
  const candidateIds = txns
    .filter((t) => t.kind === "ingreso" && (t.linkedKind ?? "none") === "holding")
    .map((t) => t.id);
  const dividendTxnIds = await getDividendTxnIds(candidateIds, ctx);

  const rows: MonthFlowRow[] = txns.map((t: Transaction) => ({
    flow: classifyTxnFlow(t, dividendTxnIds),
    kind: t.kind,
    value: convertCurrency(t.amount, t.currency, currency, rates),
    confirmed: t.status === "confirmed",
    countsInBudget: t.countsInBudget ?? true,
  }));

  return aggregateMonthFlow({
    rows,
    plan: { income: base.indicators.incomeMonthly, expense: base.indicators.expenseMonthly },
    budget: budget.budgetExpense,
    currency,
  });
}
