import "server-only";

/**
 * CRUD de dividendos. Cada pago nace como transacción vinculada (ingreso,
 * linked_kind='holding') atribuida a la LÍNEA DERIVADA de dividendos del periodo
 * (income_source_id → budget_items), que llena su barra "Recibido". Ya NO se
 * crea un `income_sources` por pago: la proyección la representa la línea
 * derivada (promedio 12m, source_kind='dividend'). Mismo patrón que
 * createRentalPayment. Respeta RLS por user_id.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import {
  registerLinkedTransaction,
  deleteLinkedTransaction,
  getSystemCategoryId,
  syncDerivedBudget,
  monthPeriod,
} from "@/modules/financial-base";
import { dividendToTxn } from "@/modules/financial-base";
import { getActiveHouseholdId } from "@/lib/household/active";
import type { DividendInput } from "@/modules/wealth/schemas";
import type { Dividend } from "@/modules/wealth/types";

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
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const label = input.holdingLabel ?? input.holdingSymbol ?? "Dividendo";

  // 1) Inserta el dividendo SIN income_id: ya no se duplica en income_sources.
  //    Su renta vive en la transacción vinculada + la línea derivada.
  const { data: divRow, error: divErr } = await supabase
    .from("dividends")
    .insert({
      user_id: user.id,
      household_id,
      holding_id: input.holdingId,
      payment_date: input.paymentDate,
      amount: input.amount,
      currency: input.currency,
      yield_pct: input.yieldPct ?? null,
      frequency: freq,
      income_id: null,
      transaction_id: null,
    })
    .select("id")
    .single();
  if (divErr) throw new Error(divErr.message);

  // 2) Materializa la línea derivada de dividendos del periodo (promedio 12m,
  //    source_kind='dividend') y obtén su id para la barra "Recibido".
  const [py, pm] = input.paymentDate.split("-").map(Number);
  const period = monthPeriod(py!, pm!);
  await syncDerivedBudget(period);
  const { data: line } = await supabase
    .from("budget_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("source_kind", "dividend")
    .eq("source_id", input.holdingId)
    .eq("period_month", period.month)
    .eq("period_year", period.year)
    .maybeSingle();

  // 3) El dividendo nace como transacción vinculada (ingreso, linked_kind='holding')
  //    atribuida a esa línea: llena "Recibido" SIN duplicar en income_sources.
  let txnId: string;
  try {
    txnId = await registerLinkedTransaction(
      dividendToTxn({
        holdingId: input.holdingId,
        label,
        currency: input.currency,
        paymentDate: input.paymentDate,
        amount: input.amount,
        categoryId: await getSystemCategoryId("inc_pasivo"),
        incomeSourceId: line?.id ?? null,
      }),
    );
  } catch (err) {
    // Compensación: quita el dividendo si el ledger falla.
    await supabase.from("dividends").delete().eq("id", divRow!.id).eq("user_id", user.id);
    throw err;
  }

  const { error: upErr } = await supabase
    .from("dividends")
    .update({ transaction_id: txnId })
    .eq("id", divRow!.id)
    .eq("user_id", user.id);
  if (upErr) {
    await deleteLinkedTransaction(txnId);
    await supabase.from("dividends").delete().eq("id", divRow!.id).eq("user_id", user.id);
    throw new Error(upErr.message);
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

  const { error } = await supabase.from("dividends").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);

  if (row?.income_id) {
    await supabase.from("income_sources").delete().eq("id", row.income_id).eq("user_id", user.id);
  }
  if (row?.transaction_id) {
    await deleteLinkedTransaction(row.transaction_id);
  }
}
