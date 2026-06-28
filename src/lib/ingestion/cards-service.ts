import "server-only";

/**
 * Servicio de tarjetas por cuenta + etiquetado por último-4.
 *
 * La propiedad correo→cuenta vive en email_ingest_links. El último-4 NO es llave
 * de propiedad ni único global: es solo una ETIQUETA dentro de la cuenta (hogar si
 * existe, si no el usuario) — único por (cuenta, last4) en account_cards.
 *
 * Auto-aprendizaje: el poller guarda card_last4 en la propuesta aunque la tarjeta
 * sea desconocida; la etiqueta se resuelve al leer o cuando el usuario registra la
 * tarjeta (registerCard, lista para una server action / pantalla "¿de cuál tarjeta
 * es ...XXXX?"). Sin UI acá.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";

/** Cuenta a la que pertenece una tarjeta: hogar si existe, si no el usuario. */
export interface AccountRef {
  userId: string;
  householdId: string | null;
}

/** Tarjeta registrada (proyección mínima para etiquetar). */
export interface AccountCard {
  last4: string;
  label: string;
  holderName: string | null;
}

/**
 * Devuelve la etiqueta de la tarjeta cuyo último-4 coincide, o null si no está
 * registrada (o no hay last4). Puro: testeable sin BD.
 */
export function resolveCardLabel(cards: AccountCard[], last4: string | null | undefined): string | null {
  if (!last4) return null;
  return cards.find((c) => c.last4 === last4)?.label ?? null;
}

/** Lista las tarjetas de la cuenta (service-role; sin sesión de usuario). */
export async function listAccountCards(account: AccountRef): Promise<AccountCard[]> {
  const supabase = createServiceRoleClient();
  const sel = supabase.from("account_cards").select("last4, label, holder_name");
  const { data, error } = account.householdId
    ? await sel.eq("household_id", account.householdId)
    : await sel.eq("user_id", account.userId).is("household_id", null);
  if (error) {
    logger.warn("cards: fallo al listar tarjetas", { message: error.message });
    return [];
  }
  return (data ?? []).map((r) => ({
    last4: r.last4,
    label: r.label,
    holderName: r.holder_name,
  }));
}

/** Registra (o reetiqueta) una tarjeta de la cuenta. Idempotente por (cuenta, last4). */
export async function registerCard(input: {
  userId: string;
  householdId: string | null;
  last4: string;
  label: string;
  holderName?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("account_cards").insert({
    user_id: input.userId,
    household_id: input.householdId,
    last4: input.last4,
    label: input.label,
    holder_name: input.holderName ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Conveniencia: etiqueta de un último-4 dentro de una cuenta (lee + resuelve). */
export async function resolveCardLabelForAccount(
  account: AccountRef,
  last4: string | null | undefined,
): Promise<string | null> {
  if (!last4) return null;
  return resolveCardLabel(await listAccountCards(account), last4);
}
