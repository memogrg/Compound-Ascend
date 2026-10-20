import "server-only";

/**
 * Purga de la retención de la ingesta por correo, para TODOS los usuarios (service-role: corre
 * desde el cron, sin sesión). Borra por corte de fecha de `created_at`, sin mirar el estado:
 *
 *   - `ingest_proposals` — las propuestas (pending, confirmed, discarded, merged) y su `raw_text`.
 *   - `ingest_notices`   — los avisos con remitente, asunto y recorte del correo.
 *
 * Por LOTES de INGEST_PURGE_BATCH ids (select → delete in), para no mandar un DELETE sin techo
 * la primera vez que corre sobre meses de historia. Con un tope de lotes por corrida: lo que
 * sobre lo levanta el cron del día siguiente (el corte por fecha lo hace idempotente).
 *
 * Los movimientos ya creados NO se tocan: la relación va de la propuesta al movimiento
 * (`ingest_proposals.merged_into → transactions`, on delete set null) y nada en `transactions`
 * apunta a una propuesta, así que borrar la propuesta no puede arrastrar el movimiento.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { INGEST_RETENTION_DAYS, ingestRetentionCutoffISO } from "@/lib/ingestion/retention";

export const INGEST_RETENTION_TABLES = ["ingest_proposals", "ingest_notices"] as const;

export type IngestRetentionTable = (typeof INGEST_RETENTION_TABLES)[number];

/** Filas por lote de borrado. */
export const INGEST_PURGE_BATCH = 500;

/** Lotes máximos por tabla y corrida (100 000 filas): acota el tiempo de la función. */
export const INGEST_PURGE_MAX_BATCHES = 200;

/** Filas borradas por tabla. Lanza si cualquiera de los dos borrados falla: es una promesa al usuario. */
export async function purgeExpiredIngest(
  nowMs: number = Date.now(),
): Promise<Record<IngestRetentionTable, number>> {
  const db = createServiceRoleClient();
  const cutoff = ingestRetentionCutoffISO(nowMs);
  const deleted = {} as Record<IngestRetentionTable, number>;
  for (const table of INGEST_RETENTION_TABLES) {
    deleted[table] = 0;
    for (let batch = 0; batch < INGEST_PURGE_MAX_BATCHES; batch++) {
      const { data, error: selError } = await db
        .from(table)
        .select("id")
        .lt("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(INGEST_PURGE_BATCH);
      if (selError) throw new Error(`${table}: ${selError.message}`);
      const ids = (data ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) break;

      const { error, count } = await db.from(table).delete({ count: "exact" }).in("id", ids);
      if (error) throw new Error(`${table}: ${error.message}`);
      deleted[table] += count ?? 0;
      // Lote incompleto = ya no queda nada vencido. Cero borradas con ids en mano = algo raro
      // (no reintentar en bucle el mismo lote).
      if (ids.length < INGEST_PURGE_BATCH || !count) break;
      if (batch === INGEST_PURGE_MAX_BATCHES - 1) {
        logger.warn("ingest.retention.purge: tope de lotes alcanzado, sigue mañana", {
          table,
          deleted: deleted[table],
        });
      }
    }
  }
  logger.info("ingest.retention.purge", { cutoff, days: INGEST_RETENTION_DAYS, deleted });
  return deleted;
}
