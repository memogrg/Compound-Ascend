import "server-only";

/**
 * Escritura de transacciones desde el bot de WhatsApp con SERVICE ROLE (omite
 * RLS). Uso EXCLUSIVO del webhook, SOLO tras: (1) número con OTP verificado y
 * (2) confirmación explícita del usuario. Se setea user_id + household_id para
 * que el resto de la familia también vea el movimiento.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { findMatchingRuleForUser } from "@/modules/financial-base/services/rules-service";
import type { PendingAction } from "@/lib/whatsapp/links-service";

export async function createTransactionForUser(
  userId: string,
  householdId: string | null,
  action: PendingAction,
): Promise<{ ok: boolean; error?: string; categoryName?: string | null }> {
  const supabase = createServiceRoleClient();

  // Auto-categorización: aplica las reglas del usuario (las que crea en "Por
  // clasificar"/web) con service-role, así WhatsApp/ingesta nacen en su sobre.
  let categoryId: string | null = null;
  if ((action.kind === "gasto" || action.kind === "ingreso") && action.merchant) {
    const rule = await findMatchingRuleForUser(
      userId,
      action.merchant,
      action.kind === "gasto" ? "expense" : "income",
    );
    categoryId = rule?.suggestedCategoryId ?? null;
  }

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    household_id: householdId,
    kind: action.kind,
    description: action.description,
    merchant_or_source: action.merchant ?? null,
    amount: action.amount,
    currency: action.currency,
    occurred_on: action.occurredOn,
    category_id: categoryId,
    account_id: null,
    account_label: null,
    status: "confirmed",
    origin: action.origin,
    source: action.source,
    confirmed_by_user: true,
  });
  if (error) return { ok: false, error: error.message };

  // Nombre del sobre para el feedback (best-effort, service-role).
  let categoryName: string | null = null;
  if (categoryId) {
    try {
      const { data } = await supabase
        .from("expense_categories")
        .select("name")
        .eq("id", categoryId)
        .maybeSingle();
      categoryName = data?.name ?? null;
    } catch {
      categoryName = null;
    }
  }
  return { ok: true, categoryName };
}
