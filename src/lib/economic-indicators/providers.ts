/**
 * Proveedores de indicadores. Cada función consulta una fuente externa y
 * devuelve observaciones normalizadas `{ observedDate, value }` o `[]`.
 * Con timeout, sin filtrar secretos en logs. La `unit` no la decide el
 * proveedor: viene del catálogo.
 *
 *  - BCCR: API SDDE (REST/JSON con Bearer; solo servidor, token secreto).
 *  - FRED: REST JSON (St. Louis Fed).
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export type Observation = { observedDate: string; value: number };

const TIMEOUT_MS = 6000;

async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const text = await fetchText(url, init);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Convierte un valor a número finito (acepta coma o punto decimal). */
function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ---------- BCCR (SDDE — API REST/JSON oficial, Bearer) ----------

const BCCR_SDDE_BASE =
  "https://apim.bccr.fi.cr/SDDE/api/Bccr.Ge.SDDE.Publico.Indicadores.API";

/** yyyy/mm/dd (formato exigido por el SDDE). */
function toSddeDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

/**
 * Consulta un indicador del SDDE entre dos fechas (REST/JSON, Bearer).
 * Solo servidor (token secreto). Sin token o sin datos → [].
 */
export async function fetchBccr(externalId: string, from: Date, to: Date): Promise<Observation[]> {
  const token = getServerEnv().BCCR_SDDE_TOKEN;
  if (!token) {
    logger.warn("economic-indicators: BCCR_SDDE_TOKEN ausente; omitiendo");
    return [];
  }
  const qs = new URLSearchParams({
    fechaInicio: toSddeDate(from),
    fechaFin: toSddeDate(to),
    idioma: "ES",
  });
  const url = `${BCCR_SDDE_BASE}/indicadoresEconomicos/${encodeURIComponent(externalId)}/series?${qs}`;
  const data = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0", // el ejemplo del doc SDDE lo usa; evita 403
    },
  });
  return parseSddeSeries(data);
}

/**
 * Parsea la respuesta JSON del SDDE a observaciones. Pura (sin red) para test.
 * Estructura: { estado, datos: [{ series: [{ fecha, valorDatoPorPeriodo }] }] }.
 */
export function parseSddeSeries(data: unknown): Observation[] {
  const datos =
    (data as { datos?: { series?: { fecha: string; valorDatoPorPeriodo: number | null }[] }[] } | null)?.datos ?? [];
  const out: Observation[] = [];
  for (const ind of datos) {
    for (const s of ind.series ?? []) {
      const value =
        typeof s.valorDatoPorPeriodo === "number" && Number.isFinite(s.valorDatoPorPeriodo)
          ? s.valorDatoPorPeriodo
          : null;
      const observedDate = (s.fecha ?? "").slice(0, 10);
      if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(observedDate)) continue;
      out.push({ observedDate, value });
    }
  }
  return out;
}

// ---------- Hacienda (fallback USD/CRC sin token) ----------

/**
 * Fallback SIN token para USD/CRC: API pública del Ministerio de Hacienda de
 * Costa Rica, que republica el tipo de cambio de referencia del BCCR. Solo
 * devuelve el valor del día (sin histórico). Temporal: una vez configurado
 * BCCR_WS_TOKEN, el web service del BCCR provee el histórico completo.
 */
export async function fetchHaciendaTc(
  code: "USDCRC_COMPRA" | "USDCRC_VENTA",
): Promise<Observation[]> {
  const data = (await fetchJson("https://api.hacienda.go.cr/indicadores/tc")) as
    | { dolar?: { compra?: { fecha: string; valor: number }; venta?: { fecha: string; valor: number } } }
    | null;
  const node = code === "USDCRC_COMPRA" ? data?.dolar?.compra : data?.dolar?.venta;
  if (!node || !Number.isFinite(node.valor) || node.valor <= 0) return [];
  const observedDate = (node.fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observedDate)) return [];
  return [{ observedDate, value: node.valor }];
}

// ---------- FRED ----------

/**
 * Consulta una serie de FRED y devuelve sus observaciones más recientes.
 * `limit` acota el histórico traído. Si falta la key, devuelve [].
 */
export async function fetchFred(seriesId: string, limit = 400): Promise<Observation[]> {
  const key = getServerEnv().FRED_API_KEY;
  if (!key) {
    logger.warn("economic-indicators: FRED_API_KEY ausente; omitiendo");
    return [];
  }
  const url =
    "https://api.stlouisfed.org/fred/series/observations" +
    `?series_id=${encodeURIComponent(seriesId)}&api_key=${key}` +
    `&file_type=json&sort_order=desc&limit=${limit}`;

  return parseFredObservations(await fetchJson(url));
}

/**
 * Parsea la respuesta JSON de FRED a observaciones normalizadas. Función pura
 * (sin red) para test. FRED marca valores faltantes con ".".
 */
export function parseFredObservations(data: unknown): Observation[] {
  const obs =
    (data as { observations?: { date: string; value: string }[] } | null)?.observations ?? [];
  const out: Observation[] = [];
  for (const o of obs) {
    const value = num(o.value);
    if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    out.push({ observedDate: o.date, value });
  }
  return out;
}
