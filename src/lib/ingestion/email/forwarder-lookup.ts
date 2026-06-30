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
  return { userId: data.user_id, householdId: data.household_id };
}
