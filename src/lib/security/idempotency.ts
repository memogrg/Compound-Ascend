import "server-only";

/**
 * Idempotencia de eventos entrantes (webhooks reenviados).
 *
 * Registra el evento por (provider, event_id) en `processed_events` y dice si ya
 * estaba: así un reenvío de Meta/pagos no re-dispara IA ni re-inserta dinero.
 *
 * Usa service-role (los webhooks no tienen sesión de usuario; la tabla es
 * deny-all para anon/authenticated).
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";

/**
 * Reclama un evento de forma atómica. Devuelve:
 * - `true`  → el evento YA estaba registrado (duplicado): NO reprocesar.
 * - `false` → es nuevo (recién reclamado): procesar.
 *
 * Resiliencia: si el registro falla (red/BD), devuelve `false` (fail-open) para
 * no perder eventos legítimos; el peor caso es un reproceso, no una pérdida.
 */
export async function alreadyProcessed(provider: string, eventId: string): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("processed_events")
      .upsert(
        { provider, event_id: eventId },
        { onConflict: "provider,event_id", ignoreDuplicates: true },
      )
      .select("event_id");
    if (error) {
      logger.warn("idempotency: fallo al registrar evento; se procesa igual", { provider });
      return false;
    }
    // Con ignoreDuplicates, `data` vacío ⇒ el evento ya existía (duplicado).
    return Array.isArray(data) && data.length === 0;
  } catch (err) {
    logger.warn("idempotency: excepción al registrar evento; se procesa igual", {
      provider,
      message: err instanceof Error ? err.message : "?",
    });
    return false;
  }
}
