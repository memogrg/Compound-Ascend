/**
 * RETENCIÓN DE LA INGESTA POR CORREO — la única fuente de verdad de "cuánto se guarda".
 *
 * La Política de privacidad (§6 y tabla §8) promete 30 días para los correos reenviados y sus
 * propuestas, resueltas o no. Este módulo es PURO (sin "server-only") para que el cron y su test
 * compartan el mismo corte; el borrado vive en `retention-service.ts`.
 */

/** Días que se conservan los correos ingeridos y sus propuestas. Cambiarlo exige cambiar la política. */
export const INGEST_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instante (ISO) a partir del cual una fila sigue vigente. Estrictamente más vieja → se borra. */
export function ingestRetentionCutoffISO(
  nowMs: number,
  days: number = INGEST_RETENTION_DAYS,
): string {
  return new Date(nowMs - days * DAY_MS).toISOString();
}

/** El mismo criterio que aplica la query (`created_at < corte`), para poder probarlo en memoria. */
export function isIngestExpired(
  createdAtISO: string,
  nowMs: number,
  days: number = INGEST_RETENTION_DAYS,
): boolean {
  return Date.parse(createdAtISO) < Date.parse(ingestRetentionCutoffISO(nowMs, days));
}
