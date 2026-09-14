/**
 * Núcleo numérico PURO y compartido: parseo de montos en formato español y matching por
 * tolerancia. Lo usan el guard de tendencia (producción, `tendencia-guard.ts`) y el checker de
 * grounding del audit (`tests/evals/cert/grounding.ts`) — una sola implementación para que
 * "qué cuenta como cifra citada" y "qué cuenta como respaldada" sean idénticos en ambos.
 *
 * Sin IO, sin `server-only`: testeable a fondo.
 */

import { parseMonto } from "@/lib/parse-monto";

/** Debajo de esto, probablemente son conteos/porcentajes/meses — no montos de dinero. */
export const MIN_MONEY = 10_000;
/** Tolerancia relativa (2%) para redondeo/formato de visualización. */
export const REL_TOL = 0.02;

/**
 * Parsea un token numérico en formato español ("1.250.000", "1,25") a float.
 *
 * Delega en `@/lib/parse-monto`: una sola regla para todo el repositorio. `null` en vez de
 * `undefined` porque es el contrato que esperan `extractMoneyFigures` y el guard.
 */
export function parseNumberToken(tok: string): number | null {
  return parseMonto(tok) ?? null;
}

/** Extrae los montos de dinero citados (maneja sufijos "millones"/"mil"). */
export function extractMoneyFigures(reply: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d.,]*)\s*(millones?|mill?|m\b|mil\b)?/gi;
  for (const m of reply.matchAll(re)) {
    const raw = m[1];
    if (raw === undefined) continue;
    // Saltar porcentajes y años.
    const after = reply.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1);
    if (after === "%") continue;
    let val = parseNumberToken(raw);
    if (val === null) continue;
    const mag = (m[2] ?? "").toLowerCase();
    if (mag.startsWith("mill") || mag === "m") val *= 1_000_000;
    else if (mag === "mil") val *= 1_000;
    if (val >= 1900 && val <= 2100 && !mag) continue; // parece un año
    if (val >= MIN_MONEY) out.push(Math.round(val));
  }
  return out;
}

/** ¿`figure` está a tolerancia relativa de `target`? (con piso absoluto de 1). */
export function near(figure: number, target: number): boolean {
  return Math.abs(figure - target) <= Math.max(1, Math.abs(target) * REL_TOL);
}
