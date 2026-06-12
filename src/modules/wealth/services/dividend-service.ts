import "server-only";

/** CRUD de dividendos + creación de ingreso vinculado en income_sources. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  registerLinkedTransaction,
  deleteLinkedTransaction,
  getSystemCategoryId,
} from "@/modules/financial-base";
import { dividendToTxn } from "@/modules/financial-base";
import { getActiveHouseholdId } from "@/lib/household/active";
import type { DividendInput } from "@/modules/wealth/schemas";
import type { Dividend } from "@/modules/wealth/types";

// Meses que hay en un año según frecuencia (para calcular amount_monthly_base).
const FREQ_MONTHS: Record<string, number> = {
  mensual: 1, trimestral: 3, semestral: 6, anual: 12,
};

function rowToDividend(r: {
  id: string;
  holding_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  yield_pct: number | null;
  frequency: string | null;
  income_id: string | null;
}): Dividend {
  return {
    id: r.id,
    holdingId: r.holding_id,
    paymentDate: r.payment_date,
    amount: Number(r.amount),
    currency: r.currency,
    yieldPct: r.yield_pct,
    frequency: r.frequency,
    incomeId: r.income_id,
  };
}

export async function listDividends(holdingId?: string): Promise<Dividend[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("dividends")
    .select("id,holding_id,payment_date,amount,currency,yield_pct,frequency,income_id")
    .eq("user_id", user.id)
    .order("payment_date", { ascending: false });
  if (holdingId) query = query.eq("holding_id", holdingId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToDividend);
}

export async function createDividend(input: DividendInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const freq = input.frequency ?? "anual";
  const monthlyBase = input.amount / (FREQ_MONTHS[freq] ?? 12);
  const incomeName = input.holdingLabel
    ? `Dividendo — ${input.holdingLabel}`
    : input.holdingSymbol
      ? `Dividendo — ${input.holdingSymbol}`
      : "Dividendo";

  // Crea el ingreso vinculado en income_sources.
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { data: incomeRow, error: incomeErr } = await supabase
    .from("income_sources")
    .insert({
      user_id: user.id,
      household_id,
      name: incomeName,
      income_type: "dividendo",
      category: "Dividendos",
      amount: input.amount,
      currency: input.currency,
      frequency: freq,
      is_fixed: false,
      certainty: "alta",
      owner_scope: "personal",
      include_in_budget: true,
      amount_monthly_base: monthlyBase,
    })
    .select("id")
    .single();
  if (incomeErr) throw new Error(incomeErr.message);

  // Fase 1 · orquestador: el dividendo nace también como transacción
  // vinculada (ingreso, linked_kind='holding').
  const txnId = await registerLinkedTransaction(
    dividendToTxn({
      holdingId: input.holdingId,
      label: input.holdingLabel ?? input.holdingSymbol ?? "Dividendo",
      currency: input.currency,
      paymentDate: input.paymentDate,
      amount: input.amount,
      categoryId: await getSystemCategoryId("inc_pasivo"),
    }),
  );

  const { error: divErr } = await supabase.from("dividends").insert({
    user_id: user.id,
    household_id,
    holding_id: input.holdingId,
    payment_date: input.paymentDate,
    amount: input.amount,
    currency: input.currency,
    yield_pct: input.yieldPct ?? null,
    frequency: freq,
    income_id: incomeRow?.id ?? null,
    transaction_id: txnId,
  });
  if (divErr) {
    // Compensación: limpia la transacción (y el ingreso) si el ledger falla.
    await deleteLinkedTransaction(txnId);
    if (incomeRow?.id) {
      await supabase.from("income_sources").delete().eq("id", incomeRow.id).eq("user_id", user.id);
    }
    throw new Error(divErr.message);
  }
}

export async function deleteDividend(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Lee income_id/transaction_id antes de borrar para limpiar lo vinculado.
  const { data: row } = await supabase
    .from("dividends")
    .select("income_id,transaction_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("dividends")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  if (row?.income_id) {
    await supabase
      .from("income_sources")
      .delete()
      .eq("id", row.income_id)
      .eq("user_id", user.id);
  }
  if (row?.transaction_id) {
    await deleteLinkedTransaction(row.transaction_id);
  }
}
