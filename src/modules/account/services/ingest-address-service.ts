import "server-only";

/**
 * Dirección de ingesta ÚNICA por cuenta: la forma de que el usuario no tenga que
 * verificar nada. Copia su dirección, arma el reenvío en su correo, y el
 * destinatario ya identifica su cuenta —sin códigos, sin allowlist—.
 *
 * Se crea sola la primera vez que el usuario abre la pantalla. Escribe con
 * service-role porque la tabla no tiene grant para el cliente (si lo tuviera,
 * alguien podría adjudicarse la dirección de otro); `user_id` sale siempre de la
 * sesión, nunca del cliente. La LECTURA va con cliente de sesión → RLS de verdad.
 *
 * Si `INGEST_ADDRESS_DOMAIN` no está configurado, devuelve null y la app no
 * ofrece direcciones únicas: queda solo el carril heredado de la dirección plana.
 */
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getActiveHouseholdId } from "@/lib/household/active";
import { getServerEnv } from "@/lib/env";
import { buildIngestAddress, generateIngestToken } from "@/lib/ingestion/email/ingest-address";
import { logger } from "@/lib/logger";

/** Dominio de las direcciones únicas, o null si la app no lo tiene configurado. */
export function ingestAddressDomain(): string | null {
  return getServerEnv().INGEST_ADDRESS_DOMAIN || null;
}

/** Busca la dirección viva de la cuenta (hogar si existe, si no el usuario). */
async function findLive(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  householdId: string | null,
): Promise<string | null> {
  const q = admin.from("ingest_addresses").select("address").is("revoked_at", null);
  const { data } = householdId
    ? await q.eq("household_id", householdId).maybeSingle()
    : await q.eq("user_id", userId).is("household_id", null).maybeSingle();
  return data?.address ?? null;
}

/**
 * Devuelve la dirección de ingesta de la cuenta, creándola la primera vez.
 * null si el dominio no está configurado (o si el alta falla: la pantalla
 * simplemente no la ofrece, sin romperse).
 */
export async function getOrCreateIngestAddress(): Promise<string | null> {
  const domain = ingestAddressDomain();
  if (!domain) return null;

  const user = await requireUser();
  const sessionDb = await createSupabaseServerClient();
  const householdId = await getActiveHouseholdId(sessionDb, user.id);
  const admin = createServiceRoleClient();

  const existing = await findLive(admin, user.id, householdId);
  if (existing) return existing;

  const address = buildIngestAddress(generateIngestToken(), domain);
  const { error } = await admin.from("ingest_addresses").insert({
    user_id: user.id,
    household_id: householdId,
    address,
    created_by: user.id,
    last_edited_by: user.id,
  });
  if (!error) return address;

  // 23505: dos pestañas del mismo hogar entraron a la vez, o (casi imposible) el
  // token chocó. En ambos casos la respuesta correcta es leer la que ya existe.
  if (error.code === "23505") return findLive(admin, user.id, householdId);
  logger.warn("ingest-address: no se pudo crear la dirección", { message: error.message });
  return null;
}
