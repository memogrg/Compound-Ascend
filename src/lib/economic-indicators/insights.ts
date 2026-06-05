import "server-only";

/**
 * Derivaciones informativas sobre los indicadores (lectura de BD vía index.ts):
 *  - Inflación interanual a partir de un índice de precios (CPI).
 *  - Contexto de la TBP (valor y variación) para notas sobre deuda.
 *
 * Nada de esto ejecuta acciones; solo provee números para mensajes informativos.
 */
import { getHistory, getLatest, getChange } from "@/lib/economic-indicators/index";

/**
 * Inflación interanual (proporción 0-1) a partir del histórico de un índice de
 * precios: último valor vs. el más cercano a 12 meses atrás. null si no alcanza.
 */
export async function getYoYInflation(cpiCode: string): Promise<number | null> {
  const hist = await getHistory(cpiCode, "5Y");
  if (hist.length < 2) return null;
  const latest = hist[hist.length - 1]!;
  const target = new Date(latest.date);
  target.setUTCFullYear(target.getUTCFullYear() - 1);
  const targetIso = target.toISOString().slice(0, 10);

  let base: number | null = null;
  for (const p of hist) {
    if (p.date <= targetIso) base = p.value;
    else break;
  }
  if (base === null || base === 0) return null;
  return latest.value / base - 1;
}

export interface TbpContext {
  /** Valor actual de la TBP en porcentaje (p. ej. 3.75). */
  valuePct: number;
  /** Variación absoluta en puntos porcentuales vs. ~6 meses atrás (o null). */
  change6mAbs: number | null;
  observedDate: string;
}

/** Contexto de la TBP para notas sobre deuda. null si aún no hay datos. */
export async function getTbpContext(): Promise<TbpContext | null> {
  const latest = await getLatest("TBP");
  if (!latest) return null;
  const change = await getChange("TBP", 6);
  return {
    valuePct: latest.value,
    change6mAbs: change.absChange,
    observedDate: latest.observedDate,
  };
}
