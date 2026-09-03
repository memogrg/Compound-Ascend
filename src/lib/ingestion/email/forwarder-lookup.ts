import "server-only";

/**
 * Resuelve el dueño de un correo entrante por `forwarder_email` para el poller de
 * ingesta. SOLO filas VERIFICADAS: el poller no procesa remitentes sin verificar.
 * forwarder_email es citext → comparación case-insensitive.
 *
 * Trae TODOS los match, no el primero: si los candidatos de un correo apuntan a
 * dos cuentas distintas —dos personas con cuentas separadas en copia del mismo
 * aviso, o un reenvío con copia a otro usuario— devolver "cualquiera" metería el
 * gasto de alguien en la cuenta de otro, sin error y sin rastro. Eso se responde
 * `ambiguous` y el correo se queda sin procesar.
 *
 * "Cuenta" = hogar si existe, si no el usuario: el mismo criterio del índice de
 * dedup. Dos correos del MISMO hogar no son ambigüedad.
 *
 * Vive fuera del route porque Next no permite exports arbitrarios en archivos de
 * ruta (solo GET/POST/runtime/…).
 */
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OwnerLookup } from "@/lib/ingestion/email/imap-poller";
import { isValidTimeZone } from "@/lib/time/user-time-core";

export async function lookupOwnerByForwarder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  candidates: string[],
): Promise<OwnerLookup> {
  if (candidates.length === 0) return { status: "none" };
  const { data, error } = await supabase
    .from("email_ingest_links")
    .select("user_id, household_id")
    .eq("verified", true)
    .in("forwarder_email", candidates);
  if (error || !data || data.length === 0) return { status: "none" };

  const cuentas = new Set(data.map((r) => r.household_id ?? r.user_id));
  if (cuentas.size > 1) return { status: "ambiguous", cuentas: cuentas.size };

  const fila = data[0]!;
  // Tz del usuario para fechar la propuesta en su zona (consistente con #90) cuando el parser no
  // extrae fecha del correo. Best-effort: sin tz válida guardada, el fallback usa la zona default.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("timezone")
    .eq("user_id", fila.user_id)
    .maybeSingle();
  const timezone = isValidTimeZone(settings?.timezone) ? settings.timezone : null;
  return {
    status: "found",
    owner: { userId: fila.user_id, householdId: fila.household_id, timezone },
  };
}
