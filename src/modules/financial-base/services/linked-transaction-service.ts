import "server-only";

/**
 * Orquestador de escritura (Fase 1 · interconexión de bloques).
 *
 * "Una transacción es el hecho único": cuando otro módulo registra un evento
 * de dinero (pago de deuda, dividendo, renta, aporte a meta), pasa por aquí
 * para que la transacción vinculada y el registro especializado nazcan en la
 * misma operación.
 *
 * Patrón: la transacción se crea primero (devuelve id); el caller escribe su
 * registro especializado con ese id. Si la escritura especializada falla, el
 * caller invoca el rollback compensatorio (deleteLinkedTransaction) y
 * propaga el error — así no quedan transacciones huérfanas.
 *
 * Dirección de dependencia: control/wealth → financial-base (nunca al revés),
 * igual que el resto del codebase.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { createTransaction } from "@/modules/financial-base/services/transaction-service";
import { txnInputSchema } from "@/modules/financial-base/schemas";
import type { LinkedTxnInput } from "@/modules/financial-base/engine/linked";

/**
 * Crea la transacción vinculada y devuelve su id. Valida el input con el
 * mismo schema que el resto del módulo (defaults incluidos).
 */
export async function registerLinkedTransaction(input: LinkedTxnInput): Promise<string> {
  const parsed = txnInputSchema.parse(input);
  const { id } = await createTransaction(parsed);
  return id;
}

/**
 * Propagación para transacciones vinculadas creadas DESDE el composer
 * (Fase 2): escribe el registro especializado mínimo para que el módulo
 * dueño vea el evento. Solo debt/goal — los flujos de wealth (dividendo,
 * renta) tienen su propio formulario y pasan por sus servicios.
 *
 * NO se usa en los flujos de control/wealth (Fase 1): ellos escriben su
 * ledger completo (extra, modos, income_sources) y llaman a
 * registerLinkedTransaction; propagar aquí también lo duplicaría.
 */
export async function propagateLinkedTransaction(args: {
  transactionId: string;
  kind: string;
  linkedKind: string;
  linkedId: string | null;
  amount: number;
  occurredOn: string;
}): Promise<void> {
  if (!args.linkedId || args.kind !== "gasto") return;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (args.linkedKind === "debt") {
    const { error } = await supabase.from("debt_payments").insert({
      user_id: user.id,
      debt_id: args.linkedId,
      occurred_on: args.occurredOn,
      amount: args.amount,
      extra_amount: 0,
      extra_mode: null,
      transaction_id: args.transactionId,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (args.linkedKind === "goal") {
    const { data: goal, error: gErr } = await supabase
      .from("savings_goals")
      .select("current_amount")
      .eq("id", args.linkedId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!goal) throw new Error("Meta no encontrada");
    const { error } = await supabase
      .from("savings_goals")
      .update({ current_amount: Number(goal.current_amount) + args.amount })
      .eq("id", args.linkedId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }
  // holding / policy / rental: sin propagación desde el composer (por ahora).
}

/** Rollback compensatorio: borra la transacción creada por el orquestador. */
export async function deleteLinkedTransaction(transactionId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("transactions").delete().eq("id", transactionId).eq("user_id", user.id);
}

/**
 * Id de una categoría de sistema por key (p. ej. 'deudas', 'inc_pasivo').
 * Best-effort: si no existe devuelve null y la transacción queda sin categoría
 * (el vínculo linked_kind/linked_id sigue contando la historia).
 */
export async function getSystemCategoryId(key: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("expense_categories")
    .select("id")
    .eq("key", key)
    .eq("is_system", true)
    .maybeSingle();
  return data?.id ?? null;
}
