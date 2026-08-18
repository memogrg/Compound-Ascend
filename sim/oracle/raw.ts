/**
 * Reads the RAW rows the oracle re-derives from, via ctx.db (the signed-in RLS client
 * — a plain SQL read, not app logic). This is harness-side, so importing the AuthContext
 * type is fine; the purity rule is on metrics.ts only. Everything is the user's own rows.
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import type { RawData } from "./types";

const asBool = (v: unknown): boolean => v !== false; // null/undefined → on-budget (true)

export async function readRaw(ctx: AuthContext): Promise<RawData> {
  const uid = ctx.userId;
  const db = ctx.db;

  const [
    txns,
    ledger,
    incomes,
    expenses,
    budgetItems,
    debts,
    debtPayments,
    holdingContributions,
    investmentTxns,
    holdings,
    goals,
  ] = await Promise.all([
    db.from("transactions").select("kind, amount, occurred_on, linked_kind, linked_id, counts_in_budget, category_id, status").eq("user_id", uid),
    db.from("liquidity_ledger").select("delta, reason").eq("user_id", uid),
    db.from("income_sources").select("amount_monthly_base, include_in_budget").eq("user_id", uid),
    db.from("expense_items").select("amount_monthly_base, nature").eq("user_id", uid),
    db.from("budget_items").select("type, amount, category_id, period_year, period_month").eq("user_id", uid),
    db.from("debts").select("id, original_amount, balance, apr, current_payment, min_payment").eq("user_id", uid),
    db.from("debt_payments").select("debt_id, occurred_on, amount, extra_amount, kind").eq("user_id", uid),
    db.from("holding_contributions").select("holding_id, amount, unit_price").eq("user_id", uid),
    db.from("investment_transactions").select("holding_id, tx_type, amount, quantity").eq("user_id", uid),
    db.from("investment_holdings").select("id, asset_type, symbol, label, current_value_manual").eq("user_id", uid),
    db.from("savings_goals").select("id, current_amount, target_amount").eq("user_id", uid),
  ]);

  const err =
    txns.error ?? ledger.error ?? incomes.error ?? expenses.error ?? budgetItems.error ??
    debts.error ?? debtPayments.error ?? holdingContributions.error ?? investmentTxns.error ??
    holdings.error ?? goals.error;
  if (err) throw new Error(`[oracle] lectura cruda falló: ${err.message}`);

  return {
    txns: (txns.data ?? []).map((r) => ({
      kind: String(r.kind),
      amount: Number(r.amount),
      occurred_on: String(r.occurred_on),
      linked_kind: String(r.linked_kind ?? "none"),
      linked_id: r.linked_id ?? null,
      counts_in_budget: asBool(r.counts_in_budget),
      category_id: r.category_id ?? null,
      status: String(r.status ?? "confirmed"),
    })),
    ledger: (ledger.data ?? []).map((r) => ({ delta: Number(r.delta), reason: String(r.reason ?? "") })),
    incomes: (incomes.data ?? []).map((r) => ({
      amount_monthly_base: Number(r.amount_monthly_base ?? 0),
      include_in_budget: asBool(r.include_in_budget),
    })),
    expenses: (expenses.data ?? []).map((r) => ({
      amount_monthly_base: Number(r.amount_monthly_base ?? 0),
      nature: String(r.nature ?? "esencial"),
    })),
    budgetItems: (budgetItems.data ?? []).map((r) => ({
      type: String(r.type),
      amount: Number(r.amount),
      category_id: r.category_id ?? null,
      period_year: Number(r.period_year),
      period_month: Number(r.period_month),
    })),
    debts: (debts.data ?? []).map((r) => ({
      id: String(r.id),
      original_amount: r.original_amount == null ? null : Number(r.original_amount),
      balance: Number(r.balance),
      apr: r.apr == null ? null : Number(r.apr),
      current_payment: r.current_payment == null ? null : Number(r.current_payment),
      min_payment: r.min_payment == null ? null : Number(r.min_payment),
    })),
    debtPayments: (debtPayments.data ?? []).map((r) => ({
      debt_id: String(r.debt_id),
      occurred_on: String(r.occurred_on),
      amount: Number(r.amount),
      extra_amount: r.extra_amount == null ? null : Number(r.extra_amount),
      kind: String(r.kind ?? "ordinario"),
    })),
    holdingContributions: (holdingContributions.data ?? []).map((r) => ({
      holding_id: String(r.holding_id),
      amount: Number(r.amount),
      unit_price: r.unit_price == null ? null : Number(r.unit_price),
    })),
    investmentTxns: (investmentTxns.data ?? []).map((r) => ({
      holding_id: r.holding_id ?? null,
      tx_type: r.tx_type ?? null,
      amount: Number(r.amount),
      quantity: r.quantity == null ? null : Number(r.quantity),
    })),
    holdings: (holdings.data ?? []).map((r) => ({
      id: String(r.id),
      asset_type: String(r.asset_type),
      symbol: r.symbol ?? null,
      label: String(r.label),
      current_value_manual: r.current_value_manual == null ? null : Number(r.current_value_manual),
    })),
    goals: (goals.data ?? []).map((r) => ({
      id: String(r.id),
      current_amount: Number(r.current_amount ?? 0),
      target_amount: Number(r.target_amount ?? 0),
    })),
  };
}
