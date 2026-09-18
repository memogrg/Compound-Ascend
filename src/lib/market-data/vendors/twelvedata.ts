import { getJson, isoInstant, positive, signed } from "./http.ts";
import type { MarketVendor, VendorDeps, VendorHighlight } from "./types.ts";

/**
 * Sufijo de bolsa del símbolo guardado → código de bolsa de Twelve Data.
 *
 * El buscador de la app es el de Finnhub, que nombra las cotizaciones de Londres con `.L`
 * (`VWRA.L`), así que ese es el formato que hay en los holdings. `.LSE` se acepta también.
 * Las demás bolsas se agregan con `MARKET_EXCHANGE_SUFFIXES` (ej. `DE=XETR,AS=Euronext`) en vez
 * de adivinarlas acá: un código equivocado cotiza OTRO instrumento sin ningún error.
 */
const SUFIJOS_BASE: Record<string, string> = { L: "LSE", LSE: "LSE" };

/**
 * `VWRA.L` → `VWRA:LSE`, el formato que Twelve Data acepta DENTRO de un lote (el parámetro
 * `exchange=` es uno solo para toda la llamada y no sirve para mezclar bolsas). Un símbolo que ya
 * trae `:` o que no tiene sufijo conocido pasa igual.
 */
export function toTwelveSymbol(symbol: string, extra: Record<string, string> = {}): string {
  const s = symbol.trim().toUpperCase();
  if (s.includes(":")) return s;
  const m = /^(.+)\.([A-Z]{1,6})$/.exec(s);
  const bolsa = m ? (extra[m[2]!] ?? SUFIJOS_BASE[m[2]!]) : undefined;
  return m && bolsa ? `${m[1]}:${bolsa}` : s;
}

/** `MARKET_EXCHANGE_SUFFIXES="DE=XETR,AS=Euronext"` → `{ DE: "XETR", AS: "Euronext" }`. */
export function parseExchangeSuffixes(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const par of (raw ?? "").split(",")) {
    const [k, v] = par.split("=").map((x) => x.trim());
    if (k && v) out[k.toUpperCase()] = v;
  }
  return out;
}

type Quote = {
  symbol?: string;
  currency?: string;
  close?: string;
  percent_change?: string;
  timestamp?: number;
  datetime?: string;
  fifty_two_week?: { high?: string };
  status?: string;
  code?: number;
  message?: string;
};

/** Twelve Data admite hasta 120 símbolos por lote. */
const LOTE = 120;

export function createTwelveData(
  deps: VendorDeps,
  suffixes: Record<string, string> = {},
): MarketVendor {
  const key = deps.keys.twelvedata;

  async function quotes(symbols: string[]): Promise<Record<string, VendorHighlight>> {
    const out: Record<string, VendorHighlight> = {};
    if (!key) return out;
    // Identificador de Twelve Data → símbolo que pidió quien llamó. La clave va en MAYÚSCULAS
    // para encontrarla en la respuesta sin depender de cómo capitaliza la bolsa (`Euronext`); lo
    // que se MANDA es el identificador tal cual se armó.
    const pedido = new Map<string, string>();
    const ids: string[] = [];
    for (const raw of symbols) {
      const s = raw.trim().toUpperCase();
      if (!s) continue;
      const id = toTwelveSymbol(s, suffixes);
      if (pedido.has(id.toUpperCase())) continue;
      pedido.set(id.toUpperCase(), s);
      ids.push(id);
    }

    for (let i = 0; i < ids.length; i += LOTE) {
      const lote = ids.slice(i, i + LOTE);
      const url = `https://api.twelvedata.com/quote?symbol=${lote.map(encodeURIComponent).join(",")}`;
      // Cada símbolo del lote es un crédito, no la llamada: por eso se cobra el tamaño del lote.
      const r = await getJson(deps, "twelvedata", url, {
        headers: { Authorization: `apikey ${key}` },
        timeoutMs: 12000,
        credits: lote.length,
      });
      if (!r.ok) {
        deps.warn?.(`twelvedata /quote status=${r.status} simbolos=${lote.length}`);
        continue;
      }
      const body = r.body as Record<string, unknown> | null;
      if (!body) continue;
      if (body.status === "error") {
        deps.warn?.(`twelvedata /quote error=${String(body.message ?? body.code ?? "?")}`);
        continue;
      }
      // Con UN símbolo responde el objeto plano; con varios, un objeto con clave por identificador.
      const entradas: [string, Quote][] =
        lote.length === 1
          ? [[lote[0]!, body as Quote]]
          : (Object.entries(body) as [string, Quote][]);

      for (const [id, q] of entradas) {
        const s = pedido.get(id.toUpperCase());
        if (!s) continue;
        if (q.status === "error" || q.code) {
          deps.warn?.(`twelvedata ${id}: ${q.message ?? q.code ?? "error"}`);
          continue;
        }
        out[s] = aHighlight(s, q);
      }
    }
    return out;
  }

  return { id: "twelvedata", kinds: ["stock"], getQuotes: quotes, getHighlights: quotes };
}

/**
 * Londres cotiza muchos instrumentos en PENIQUES (`GBp`/`GBX`). Guardarlos tal cual haría que un
 * ETF de £75 aparezca como 7.500 "GBP" — cien veces de más, sin ningún error a la vista. Se pasan
 * a libras. Los que cotizan en USD en Londres, como VWRA, no se tocan.
 */
function aHighlight(symbol: string, q: Quote): VendorHighlight {
  const raw = (q.currency ?? "USD").trim();
  const peniques = raw === "GBp" || raw.toUpperCase() === "GBX";
  const escala = (n: number | null) => (n === null ? null : peniques ? n / 100 : n);
  const high = escala(positive(q.fifty_two_week?.high));
  return {
    symbol,
    price: escala(positive(q.close)),
    currency: peniques ? "GBP" : raw.toUpperCase().slice(0, 3),
    asOf: isoInstant(q.timestamp ?? q.datetime),
    high,
    highDate: null, // Twelve Data da el valor del máximo de 52 semanas, no el día
    highKind: high !== null ? "52w" : null,
    high24h: null,
    changePct: signed(q.percent_change),
  };
}
