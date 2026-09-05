/**
 * Registro de fuentes de ingesta por notificación de banco. parseNotification
 * prueba cada fuente en orden y devuelve el primer match no vacío. Orden: las
 * plantillas exactas por banco (BAC, BCR, BN, Davivienda, Promerica) van primero; la genérica de Costa Rica
 * (BNCR/BCR/Popular/…, por anclas comunes) cierra como red. Sumar una plantilla
 * exacta = agregar su archivo y una línea aquí ANTES de la genérica; el router
 * NO cambia. `meta` (remitente y asunto del correo) ayuda a ubicar el banco y a
 * rescatar comercio/fecha cuando el cuerpo llega pobre.
 */
import type { RawMovement, IngestionSource, NotificationMeta } from "@/lib/ingestion/types";
import { bacNotificationSource } from "@/lib/ingestion/sources/bac-notification";
import { bcrNotificationSource } from "@/lib/ingestion/sources/bcr-notification";
import { bnNotificationSource } from "@/lib/ingestion/sources/bn-notification";
import { daviviendaNotificationSource } from "@/lib/ingestion/sources/davivienda-notification";
import { promericaNotificationSource } from "@/lib/ingestion/sources/promerica-notification";
import { crGenericNotificationSource } from "@/lib/ingestion/sources/cr-generic-notification";

// Plantillas exactas (calibradas con correos reales) primero; la genérica cierra.
const SOURCES: IngestionSource<string>[] = [
  bacNotificationSource,
  bcrNotificationSource,
  bnNotificationSource,
  daviviendaNotificationSource,
  promericaNotificationSource,
  crGenericNotificationSource,
];

export function parseNotification(text: string, meta?: NotificationMeta): RawMovement[] {
  for (const source of SOURCES) {
    const movs = source.parse(text, meta);
    if (movs.length) return movs;
  }
  return [];
}
