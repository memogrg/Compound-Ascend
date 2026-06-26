/**
 * Normalizador puro de la capa de ingesta: convierte un RawMovement (shape común
 * de cualquier fuente) al PendingAction que ya consume el webhook, y produce una
 * clave de deduplicación estable. Sin IO. `import type` mantiene esto libre de
 * "server-only" (links-service lo es; aquí solo usamos su TIPO).
 */
import { createHash } from "node:crypto";
import type { PendingAction } from "@/lib/whatsapp/links-service";
import type { RawMovement } from "@/lib/ingestion/types";

/**
 * Mapea un RawMovement al shape PendingAction. La ingesta marca origin/source
 * como "notification" (valores nuevos de la unión, CAMBIO 3).
 */
export function toPendingAction(m: RawMovement): PendingAction {
  return {
    kind: m.kind,
    description: m.description,
    amount: m.amount,
    currency: m.currency,
    occurredOn: m.occurredOn,
    merchant: m.merchant,
    origin: "notification",
    source: "notification",
  };
}

/**
 * Clave de deduplicación: el `externalRef` del origen si existe; si no, un hash
 * estable de banco|monto|fecha|comercio (comercio normalizado) para evitar
 * duplicados de notificaciones equivalentes.
 */
export function dedupKey(m: RawMovement): string {
  if (m.externalRef) return m.externalRef;
  const composite = [
    m.bankCode ?? "?",
    m.amount,
    m.occurredOn,
    (m.merchant ?? "").trim().toLowerCase(),
  ].join("|");
  return createHash("sha256").update(composite).digest("hex").slice(0, 16);
}
