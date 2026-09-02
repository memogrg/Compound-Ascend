import "server-only";

/**
 * Resuelve el dueño de un correo por su DIRECCIÓN DE INGESTA única.
 *
 * Es el camino preferente y el más fuerte: la dirección la estampa el receptor
 * (Google, en `X-Gm-Original-To`), es única por índice y es un secreto que solo
 * conoce su dueño. Por eso —a diferencia del carril heredado— aquí NO hace falta
 * verificar nada por código: quien conoce la dirección es quien la recibió de la
 * app. Y no puede haber ambigüedad: el índice único la garantiza.
 *
 * Una dirección revocada (rotación) deja de resolver y nunca se reasigna.
 */
import type { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OwnerLookup } from "@/lib/ingestion/email/imap-poller";
import { isValidTimeZone } from "@/lib/time/user-time-core";

export async function lookupOwnerByIngestAddress(
  supabase: ReturnType<typeof createServiceRoleClient>,
  addresses: string[],
): Promise<OwnerLookup> {
  if (addresses.length === 0) return { status: "none" };
  const { data, error } = await supabase
    .from("ingest_addresses")
    .select("user_id, household_id")
    .is("revoked_at", null)
    .in("address", addresses);
  if (error || !data || data.length === 0) return { status: "none" };

  // Dos direcciones de ingesta DISTINTAS en un mismo correo (alguien puso a dos
  // usuarios en copia) siguen siendo ambigüedad: no se adivina.
  const cuentas = new Set(data.map((r) => r.household_id ?? r.user_id));
  if (cuentas.size > 1) return { status: "ambiguous", cuentas: cuentas.size };

  const fila = data[0]!;
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
