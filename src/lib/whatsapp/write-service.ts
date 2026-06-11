import "server-only";

/**
 * Escritura de transacciones desde el bot de WhatsApp con SERVICE ROLE (omite
 * RLS). Uso EXCLUSIVO del webhook, SOLO tras: (1) número con OTP verificado y
 * (2) confirmación explícita del usuario. Se setea user_id + household_id para
 * que el resto de la familia también vea el movimiento.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { PendingAction } from "@/lib/whatsapp/links-service";

export async function createTransactionForUser(
  userId: string,
  householdId: string | null,
  action: PendingAction,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    household_id: householdId,
    kind: action.kind,
    description: action.description,
    merchant_or_source: action.merchant ?? null,
    amount: action.amount,
    currency: action.currency,
    occurred_on: action.occurredOn,
    category_id: null,
    account_id: null,
    account_label: null,
    status: "confirmed",
    origin: action.origin,
    source: action.source,
    confirmed_by_user: true,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
