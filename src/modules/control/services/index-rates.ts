import "server-only";

/**
 * Tasas de referencia para deudas variables, leídas del módulo de Indicadores
 * Económicos (economic_indicators). Con fallback: si el índice no está
 * disponible, la TAE efectiva cae al valor manual (debt.apr).
 */
import { getLatest } from "@/lib/economic-indicators";
import type { Debt } from "@/modules/control/types";

/** Índice de la deuda → código del indicador económico. */
const INDEX_CODE: Record<string, string> = {
  prime: "FED_PRIME",
  tbp: "TBP",
  tri: "TRI",
};

/** Último valor de cada índice disponible (omite los que no estén ingeridos). */
export async function getIndexRates(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    Object.entries(INDEX_CODE).map(async ([key, code]) => {
      try {
        const latest = await getLatest(code);
        return [key, latest?.value ?? null] as const;
      } catch {
        return [key, null] as const;
      }
    }),
  );
  const out: Record<string, number> = {};
  for (const [k, v] of entries) if (v != null) out[k] = v;
  return out;
}

/** TAE efectiva: para variables, índice + spread; si no hay índice, el manual. */
export function effectiveApr(d: Debt, indexRates?: Record<string, number>): number {
  if (d.rateType === "variable" && d.rateIndex && d.rateSpread != null) {
    const idx = indexRates?.[d.rateIndex];
    if (idx != null) return idx + d.rateSpread;
  }
  return d.apr ?? 0;
}

/** Nota informativa cuando el índice movió la TAE respecto al valor guardado. */
export function buildRateNote(d: Debt, indexRates?: Record<string, number>): string | null {
  if (d.rateType !== "variable" || !d.rateIndex || d.rateSpread == null) return null;
  const idx = indexRates?.[d.rateIndex];
  if (idx == null) return null;
  const eff = idx + d.rateSpread;
  const stored = d.apr ?? 0;
  if (stored <= 0 || Math.abs(eff - stored) < 0.05) return null;
  return (
    `Tu TAE pasó de ${stored.toFixed(2)}% a ${eff.toFixed(2)}% ` +
    `(${d.rateIndex.toUpperCase()} ${idx.toFixed(2)}% + ${d.rateSpread}%).`
  );
}
