import "server-only";

/**
 * Eventos de renta recibida (alquiler/Airbnb/auto/negocio). Mismo patrón que
 * dividend-service: cada renta registrada crea y enlaza un `income_sources`
 * (pasivo, categoría "Renta / alquiler") para sumar al ingreso pasivo real, y
 * al borrar se revierte el ingreso vinculado. Respeta RLS por user_id.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { RentalPaymentInput } from "@/modules/wealth/schemas";
import type { RentalPayment } from "@/modules/wealth/types";

const FREQ_MONTHS: Record<string, number> = { mensual: 1, trimestral: 3, anual: 12 };

function rowToRentalPayment(r: {
  id: string;
  holding_id: string;
  received_on: string;
  amount: number;
  currency: string;
  frequency: string | null;
  income_id: string | null;
}): RentalPayment {
  return {
    id: r.id,
    holdingId: r.holding_id,
    receivedOn: r.received_on,
    amount: Number(r.amount),
    currency: r.currency,
    frequency: r.frequency,
    incomeId: r.income_id,
  };
}

export async function listRentalPayments(holdingId?: string): Promise<RentalPayment[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("rental_payments")
    .select("id,holding_id,received_on,amount,currency,frequency,income_id")
    .eq("user_id", user.id)
    .order("received_on", { ascending: false });
  if (holdingId) query = query.eq("holding_id", holdingId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRentalPayment);
}

export async function createRentalPayment(input: RentalPaymentInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const freq = input.frequency ?? "mensual";
  const monthlyBase = input.amount / (FREQ_MONTHS[freq] ?? 1);
  const incomeName = input.holdingLabel
    ? `Renta — ${input.holdingLabel}`
    : input.holdingSymbol
      ? `Renta — ${input.holdingSymbol}`
      : "Renta / alquiler";

  // Ingreso vinculado en income_sources (pasivo), mismo patrón que dividendos.
  const { data: incomeRow, error: incomeErr } = await supabase
    .from("income_sources")
    .insert({
      user_id: user.id,
      name: incomeName,
      income_type: "pasivo",
      category: "Renta / alquiler",
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

  const { error: rentErr } = await supabase.from("rental_payments").insert({
    user_id: user.id,
    holding_id: input.holdingId,
    received_on: input.receivedOn,
    amount: input.amount,
    currency: input.currency,
    frequency: freq,
    income_id: incomeRow?.id ?? null,
  });
  if (rentErr) throw new Error(rentErr.message);
}

export async function deleteRentalPayment(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: row } = await supabase
    .from("rental_payments")
    .select("income_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("rental_payments")
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
}
