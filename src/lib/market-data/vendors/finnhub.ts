import { getJson, isoDate, positive, signed } from "./http.ts";
import type { MarketVendor, VendorDeps, VendorHighlight } from "./types.ts";

/**
 * Finnhub free. Queda como RESPALDO de acciones/ETF: no batchea (una llamada por símbolo, dos si
 * además se pide el máximo) y solo cubre bolsas de EE. UU. en el plan gratis.
 *
 * El máximo es de 52 semanas (`/stock/metric`), no un ATH: las acciones no exponen un all-time-high
 * gratis, así que va etiquetado `52w` para no mentir.
 */
export function createFinnhub(deps: VendorDeps): MarketVendor {
  const base = "https://finnhub.io/api/v1";
  const token = deps.keys.finnhub;

  async function one(symbol: string, withHigh: boolean): Promise<VendorHighlight | null> {
    if (!token) return null;
    const q = encodeURIComponent(symbol);
    const [quote, metric] = await Promise.all([
      getJson(deps, "finnhub", `${base}/quote?symbol=${q}&token=${token}`),
      withHigh
        ? getJson(deps, "finnhub", `${base}/stock/metric?symbol=${q}&metric=all&token=${token}`)
        : Promise.resolve(null),
    ]);
    if (!quote.ok) deps.warn?.(`finnhub ${symbol}: quote=${quote.status}`);
    const qb = (quote.body ?? {}) as { c?: number; dp?: number; t?: number };
    const m = ((metric?.body as { metric?: Record<string, unknown> } | null)?.metric ??
      {}) as Record<string, unknown>;
    const high = positive(m["52WeekHigh"]);
    const price = positive(qb.c);
    if (price === null && high === null) return null;
    return {
      symbol,
      price,
      currency: "USD",
      asOf: typeof qb.t === "number" && qb.t > 0 ? new Date(qb.t * 1000).toISOString() : null,
      high,
      highDate: isoDate(m["52WeekHighDate"]),
      highKind: high !== null ? "52w" : null,
      high24h: null,
      changePct: signed(qb.dp),
    };
  }

  async function many(symbols: string[], withHigh: boolean) {
    const out: Record<string, VendorHighlight> = {};
    for (const raw of symbols) {
      const s = raw.trim().toUpperCase();
      const h = await one(s, withHigh);
      if (h) out[s] = h;
    }
    return out;
  }

  return {
    id: "finnhub",
    kinds: ["stock"],
    getQuotes: (symbols) => many(symbols, false),
    getHighlights: (symbols) => many(symbols, true),
  };
}
