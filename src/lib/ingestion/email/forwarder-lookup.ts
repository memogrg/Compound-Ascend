import "server-only";

/**
 * Resuelve el dueño de un correo entrante por `forwarder_email` para el poller de
 * ingesta. SOLO filas VERIFICADAS (verified=true): el poller no procesa remitentes
 * sin verificar (onboarding self-serve). forwarder_email es citext → comparación
 * case-insensitive. Vive fuera del route porque Next no permite exports arbitrarios
 * en archivos de ruta (solo GET/POST/runtime/…).
 */
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { EmailOwner } from "@/lib/ingestion/email/imap-poller";
import { isValidTimeZone } from "@/lib/time/user-time-core";

export async function lookupOwnerByForwarder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  candidates: string[],
): Promise<EmailOwner | null> {
  if (candidates.length === 0) return null;
  const { data, error } = await supabase
    .from("email_ingest_links")
    .select("user_id, household_id")
    .eq("verified", true)
    .in("forwarder_email", candidates)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  // Tz del usuario para fechar la propuesta en su zona (consistente con #90) cuando el parser no
  // extrae fecha del correo. Best-effort: sin tz válida guardada, el fallback usa la zona default.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("timezone")
    .eq("user_id", data.user_id)
    .maybeSingle();
  const timezone = isValidTimeZone(settings?.timezone) ? settings.timezone : null;
  return { userId: data.user_id, householdId: data.household_id, timezone };
}
