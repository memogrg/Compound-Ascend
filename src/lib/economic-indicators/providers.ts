/**
 * Proveedores de indicadores. Cada función consulta una fuente externa y
 * devuelve observaciones normalizadas `{ observedDate, value }` o `[]`.
 * Con timeout, sin filtrar secretos en logs. La `unit` no la decide el
 * proveedor: viene del catálogo.
 *
 *  - BCCR: web service SOAP/ASMX → XML (solo servidor; el BCCR bloquea CORS).
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

async function fetchJson(url: string): Promise<unknown | null> {
  const text = await fetchText(url);
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

/** dd/mm/yyyy a partir de un Date (formato exigido por el BCCR). */
function toBccrDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

// ---------- BCCR ----------

/** Decodifica entidades HTML básicas (el ASMX envuelve el XML escapado). */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x?\d+;/g, "")
    .replace(/&amp;/g, "&");
}

function matchAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[1] !== undefined) out.push(m[1]);
  }
  return out;
}

/**
 * Consulta un indicador del BCCR entre dos fechas y devuelve sus observaciones.
 * Si faltan credenciales o el servicio responde "Nothing", devuelve [].
 */
export async function fetchBccr(externalId: string, from: Date, to: Date): Promise<Observation[]> {
  const env = getServerEnv();
  const { BCCR_WS_EMAIL, BCCR_WS_TOKEN, BCCR_WS_NAME } = env;
  if (!BCCR_WS_EMAIL || !BCCR_WS_TOKEN || !BCCR_WS_NAME) {
    logger.warn("economic-indicators: credenciales BCCR ausentes; omitiendo");
    return [];
  }

  const params = new URLSearchParams({
    Indicador: externalId,
    FechaInicio: toBccrDate(from),
    FechaFinal: toBccrDate(to),
    Nombre: BCCR_WS_NAME,
    SubNiveles: "N",
    CorreoElectronico: BCCR_WS_EMAIL,
    Token: BCCR_WS_TOKEN,
  });
  const url =
    "https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/" +
    `ObtenerIndicadoresEconomicosXML?${params.toString()}`;

  const raw = await fetchText(url);
  if (!raw) return [];
  // Falta de algún parámetro → el servicio devuelve "Nothing" (tratar como error).
  if (/\bNothing\b/.test(raw)) {
    logger.warn("economic-indicators: BCCR devolvió Nothing", { len: externalId.length });
    return [];
  }
  return parseBccrXml(raw);
}

/**
 * Parsea la respuesta del web service del BCCR (XML, posiblemente escapado
 * dentro de un envoltorio <string>). Cada observación trae DES_FECHA y
 * NUM_VALOR; se emparejan por posición. Función pura (sin red) para test.
 */
export function parseBccrXml(raw: string): Observation[] {
  const xml = unescapeXml(raw);
  const fechas = matchAll(xml, "DES_FECHA");
  const valores = matchAll(xml, "NUM_VALOR");
  const n = Math.min(fechas.length, valores.length);
  const out: Observation[] = [];
  for (let i = 0; i < n; i++) {
    const value = num(valores[i]);
    const fecha = fechas[i];
    if (value === null || !fecha) continue;
    const observedDate = fecha.slice(0, 10); // "yyyy-mm-dd" del ISO devuelto
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedDate)) continue;
    out.push({ observedDate, value });
  }
  return out;
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

  const data = (await fetchJson(url)) as
    | { observations?: { date: string; value: string }[] }
    | null;
  const obs = data?.observations ?? [];
  const out: Observation[] = [];
  for (const o of obs) {
    const value = num(o.value); // FRED marca faltantes con "."
    if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(o.date)) continue;
    out.push({ observedDate: o.date, value });
  }
  return out;
}
