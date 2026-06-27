/**
 * Registro de fuentes de ingesta por notificación de banco. parseNotification
 * prueba cada fuente en orden y devuelve el primer match no vacío. Sumar otro
 * banco (BNCR/BCR…) = agregar su archivo y una línea aquí; el router NO cambia.
 */
import type { RawMovement, IngestionSource } from "@/lib/ingestion/types";
import { bacNotificationSource } from "@/lib/ingestion/sources/bac-notification";

const SOURCES: IngestionSource<string>[] = [bacNotificationSource];

export function parseNotification(text: string): RawMovement[] {
  for (const source of SOURCES) {
    const movs = source.parse(text);
    if (movs.length) return movs;
  }
  return [];
}
