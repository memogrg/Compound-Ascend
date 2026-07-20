import "server-only";

/**
 * Eventos de renta recibida (alquiler/Airbnb/auto/negocio). Cada pago nace como
 * transacción vinculada (ingreso, linked_kind='rental') atribuida a la LÍNEA
 * DERIVADA de renta del periodo (income_source_id → budget_items), que llena su
 * barra "Recibido" (C-2b). Ya NO se crea un `income_sources` por pago: la
 * proyección la representa la línea derivada (C-2a). El primer pago siembra
 * rental_income del holding si aún no tiene proyección, para que la barra
 * siempre exista. Respeta RLS por user_id.
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
import { rentalPaymentToTxn } from "@/modules/financial-base";
import { getActiveHouseholdId, householdMemberIds, householdWriteScope } from "@/lib/household/active";
import { logHouseholdDeletion } from "@/lib/household/activity-log";
import type { RentalPaymentInput } from "@/modules/wealth/schemas";
import type { RentalPayment } from "@/modules/wealth/types";

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
  const memberIds = await householdMemberIds(supabase, user.id);
  let query = supabase
    .from("rental_payments")
    .select("id,holding_id,received_on,amount,currency,frequency,income_id")
    .in("user_id", memberIds)
    .order("received_on", { ascending: false });
  if (holdingId) query = query.eq("holding_id", holdingId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToRentalPayment);
}

export async function createRentalPayment(input: RentalPaymentInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  const freq = input.frequency ?? "mensual";
  const household_id = await getActiveHouseholdId(supabase, user.id);

  // "No saltar la barra": si el holding de flujo aún no tiene proyección de
  // renta, el primer pago la siembra (rental_income/_frequency), para que la
  // línea derivada de C-2a (y su barra "Recibido") exista en el periodo.
  const { data: holding } = await supabase
    .from("investment_holdings")
    .select("nature,rental_income")
    .eq("id", input.holdingId)
    .in("user_id", scope)
    .maybeSingle();
  if (holding?.nature === "cashflow" && !(Number(holding.rental_income) > 0)) {
    await supabase
      .from("investment_holdings")
      .update({ last_edited_by: user.id, rental_income: input.amount, rental_frequency: freq })
      .eq("id", input.holdingId)
      .in("user_id", scope);
  }

  // Sincroniza el presupuesto del periodo del pago para materializar la línea
  // derivada de renta y obtener su id (income_source_id de la transacción).
  const [py, pm] = input.receivedOn.split("-").map(Number);
  const period = monthPeriod(py!, pm!);
  await syncDerivedBudget(period);
  const { data: line } = await supabase
    .from("budget_items")
    .select("id")
    .in("user_id", scope)
    .eq("source_kind", "rental")
    .eq("source_id", input.holdingId)
    .eq("period_month", period.month)
    .eq("period_year", period.year)
    .maybeSingle();

  // La renta nace como transacción vinculada (ingreso, linked_kind='rental')
  // atribuida a la línea derivada: llena la barra "Recibido" sin duplicar en
  // income_sources.
  const txnId = await registerLinkedTransaction(
    rentalPaymentToTxn({
      holdingId: input.holdingId,
      label: input.holdingLabel ?? input.holdingSymbol ?? "Renta / alquiler",
      currency: input.currency,
      receivedOn: input.receivedOn,
      amount: input.amount,
      categoryId: await getSystemCategoryId("inc_pasivo"),
      incomeSourceId: line?.id ?? null,
    }),
  );

  const { error: rentErr } = await supabase.from("rental_payments").insert({
    user_id: user.id,
    household_id,
    created_by: user.id,
    last_edited_by: user.id,
    holding_id: input.holdingId,
    received_on: input.receivedOn,
    amount: input.amount,
    currency: input.currency,
    frequency: freq,
    income_id: null,
    transaction_id: txnId,
  });
  if (rentErr) {
    // Compensación: limpia la transacción si el ledger falla.
    await deleteLinkedTransaction(txnId);
    throw new Error(rentErr.message);
  }
}

export async function deleteRentalPayment(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  const { data: row } = await supabase
    .from("rental_payments")
    .select("income_id,transaction_id")
    .eq("id", id)
    .in("user_id", scope)
    .maybeSingle();

  const { error } = await supabase
    .from("rental_payments")
    .delete()
    .eq("id", id)
    .in("user_id", scope);
  if (error) throw new Error(error.message);
  await logHouseholdDeletion(supabase, { userId: user.id, table: "rental_payments", rowId: id });

  // income_id solo existe en pagos LEGADO (pre C-2b); los nuevos lo tienen null
  // y su renta vive en la transacción vinculada.
  if (row?.income_id) {
    await supabase.from("income_sources").delete().eq("id", row.income_id).in("user_id", scope);
  }
  // Borrar la transacción descuenta su aporte a la barra "Recibido" del periodo.
  if (row?.transaction_id) {
    await deleteLinkedTransaction(row.transaction_id);
  }
}
