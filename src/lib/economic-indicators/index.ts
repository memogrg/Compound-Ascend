/**
 * Orquestador de indicadores económicos.
 *
 * Lectura (frontend): SIEMPRE desde BD (economic_indicators es la fuente de la
 * verdad para la UI), nunca desde la fuente externa en cada request.
 * Escritura (cron): refreshAllIndicators() recorre el catálogo, consulta cada
 * fuente y hace upsert idempotente, tolerando fallos por indicador.
 */
import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { indicatorCache, TTL } from "@/lib/economic-indicators/cache";
import { fetchBccr, fetchFred, fetchHaciendaTc } from "@/lib/economic-indicators/providers";
import { upsertIndicators } from "@/lib/economic-indicators/persist";
import {
  enabledIndicators,
  findIndicator,
  type IndicatorDef,
  type IndicatorUnit,
} from "@/lib/economic-indicators/catalog";

export type {
  IndicatorDef,
  IndicatorUnit,
  IndicatorGroup,
  IndicatorSource,
} from "@/lib/economic-indicators/catalog";
export { INDICATORS, enabledIndicators } from "@/lib/economic-indicators/catalog";

export type IndicatorRange = "6M" | "1Y" | "5Y" | "ALL";
export interface IndicatorPoint {
  date: string; // yyyy-mm-dd
  value: number;
}
export interface IndicatorLatest {
  code: string;
  value: number;
  unit: IndicatorUnit;
  observedDate: string;
}
export interface IndicatorChange {
  current: number | null;
  previous: number | null;
  /** Variación absoluta (current − previous). */
  absChange: number | null;
  /** Variación como proporción 0-1 (apta para formatPercent). null si no hay base. */
  pctChange: number | null;
}

const RANGE_DAYS: Record<Exclude<IndicatorRange, "ALL">, number> = {
  "6M": 183,
  "1Y": 366,
  "5Y": 1827,
};

function sinceDate(range: IndicatorRange): string | null {
  if (range === "ALL") return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - RANGE_DAYS[range]);
  return d.toISOString().slice(0, 10);
}

// ── Lectura ─────────────────────────────────────────────────────

/** Histórico de un indicador (ascendente por fecha), cacheado en memoria. */
export async function getHistory(
  code: string,
  range: IndicatorRange = "1Y",
): Promise<IndicatorPoint[]> {
  const cacheKey = `hist:${code}:${range}`;
  const cached = indicatorCache.get<IndicatorPoint[]>(cacheKey);
  if (cached) return cached;

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("economic_indicators")
    .select("observed_date, value")
    .eq("indicator_code", code)
    .order("observed_date", { ascending: true });

  const from = sinceDate(range);
  if (from) query = query.gte("observed_date", from);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const points: IndicatorPoint[] = (data ?? []).map((r) => ({
    date: r.observed_date,
    value: Number(r.value),
  }));
  indicatorCache.set(cacheKey, points, TTL.read);
  return points;
}

/** Último valor observado de un indicador. */
export async function getLatest(code: string): Promise<IndicatorLatest | null> {
  const cacheKey = `latest:${code}`;
  const cached = indicatorCache.get<IndicatorLatest | null>(cacheKey);
  if (cached !== null) return cached;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("economic_indicators")
    .select("value, unit, observed_date")
    .eq("indicator_code", code)
    .order("observed_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const latest: IndicatorLatest = {
    code,
    value: Number(data.value),
    unit: data.unit as IndicatorUnit,
    observedDate: data.observed_date,
  };
  indicatorCache.set(cacheKey, latest, TTL.read);
  return latest;
}

/**
 * Variación del indicador respecto a hace `months` meses. La base es la
 * observación más reciente con fecha ≤ (hoy − months). pctChange es proporción.
 */
export async function getChange(code: string, months = 6): Promise<IndicatorChange> {
  const latest = await getLatest(code);
  if (!latest) return { current: null, previous: null, absChange: null, pctChange: null };

  const target = new Date();
  target.setUTCMonth(target.getUTCMonth() - months);
  const targetDate = target.toISOString().slice(0, 10);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("economic_indicators")
    .select("value")
    .eq("indicator_code", code)
    .lte("observed_date", targetDate)
    .order("observed_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const current = latest.value;
  const previous = data ? Number(data.value) : null;
  if (previous === null) return { current, previous: null, absChange: null, pctChange: null };

  const absChange = current - previous;
  const pctChange = previous !== 0 ? absChange / previous : null;
  return { current, previous, absChange, pctChange };
}

// ── Escritura (ingesta, usada por el cron) ──────────────────────

/** Ventana de ingesta: trae ~400 días para backfill + histórico de la gráfica. */
const INGEST_WINDOW_DAYS = 400;

async function fetchObservations(def: IndicatorDef) {
  if (def.source === "BCCR") {
    const to = new Date();
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - INGEST_WINDOW_DAYS);
    const obs = await fetchBccr(def.externalId, from, to);
    if (obs.length > 0) return obs;
    // Fallback temporal SIN token: USD/CRC vía API pública de Hacienda (republica
    // el TC de referencia del BCCR). Solo valor del día. TBP/TPM no tienen fallback.
    if (def.code === "USDCRC_COMPRA" || def.code === "USDCRC_VENTA") {
      return fetchHaciendaTc(def.code);
    }
    return obs;
  }
  return fetchFred(def.externalId, INGEST_WINDOW_DAYS);
}

export interface RefreshResult {
  code: string;
  ok: boolean;
  count: number;
  error?: string;
}

/** Refresca un indicador (consulta fuente + upsert). No lanza: reporta el fallo. */
export async function refreshIndicator(def: IndicatorDef): Promise<RefreshResult> {
  try {
    const observations = await fetchObservations(def);
    if (observations.length === 0) {
      return { code: def.code, ok: false, count: 0, error: "sin datos de la fuente" };
    }
    const count = await upsertIndicators(
      observations.map((o) => ({
        indicatorCode: def.code,
        source: def.source,
        unit: def.unit,
        value: o.value,
        observedDate: o.observedDate,
      })),
    );
    return { code: def.code, ok: true, count };
  } catch (err) {
    return {
      code: def.code,
      ok: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Refresca todos los indicadores activados. Tolera fallos por indicador
 * (un error en una fuente no aborta el resto).
 */
export async function refreshAllIndicators(): Promise<RefreshResult[]> {
  const results: RefreshResult[] = [];
  for (const def of enabledIndicators()) {
    // Secuencial a propósito: evita ráfagas contra el SDDE del BCCR.
    results.push(await refreshIndicator(def));
  }
  return results;
}

export { findIndicator };
export {
  getYoYInflation,
  getTbpContext,
  type TbpContext,
} from "@/lib/economic-indicators/insights";
