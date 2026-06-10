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
  return createTransaction(parsed);
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
