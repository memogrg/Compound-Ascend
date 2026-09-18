import { getJson, isoDate, isoInstant, positive, signed } from "./http.ts";
import type { MarketVendor, VendorDeps, VendorHighlight } from "./types.ts";

/**
 * Massive (antes Polygon.io), plan Stocks Starter. SOLO bolsas de EE. UU.: un ETF UCITS en Londres
 * (VWRA.L) no existe acá, y cae al siguiente proveedor de la cadena.
 *
 * - Precio: UNA llamada con todos los símbolos al snapshot de tickers.
 * - Máximo de 52 semanas: barras diarias del último año, UNA llamada por símbolo — el snapshot no
 *   lo trae. En Starter las llamadas son ilimitadas, así que no importa el costo; lo que cuesta es
 *   tiempo, y por eso getQuotes no las pide.
 *
 * Starter es 15 minutos diferido y NO incluye `lastTrade` (solo viene si el plan incluye trades).
 * El precio sale del último minuto (`min.c`), y si el mercado está cerrado y no hay barra de hoy,
 * del cierre del día (`day.c`) o del anterior (`prevDay.c`). Uno solo de ellos en 0 no alcanza para
 * escribir: `positive` los descarta y se prueba el siguiente.
 *
 * La llave va en el header `Authorization: Bearer`, no en la URL: así no aparece en ningún log.
 */
export function createMassive(deps: VendorDeps, now: () => Date = () => new Date()): MarketVendor {
  const base = "https://api.massive.com";
  const key = deps.keys.massive;
  const headers = (): Record<string, string> => ({ Authorization: `Bearer ${key ?? ""}` });

  type Snap = {
    ticker?: string;
    min?: { c?: number };
    day?: { c?: number };
    prevDay?: { c?: number };
    todaysChangePerc?: number;
    updated?: number;
  };

  async function snapshot(symbols: string[]): Promise<Record<string, VendorHighlight>> {
    const out: Record<string, VendorHighlight> = {};
    if (!key || symbols.length === 0) return out;
    // Case-sensitive en Massive: los tickers de EE. UU. van en mayúsculas.
    const url = `${base}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${symbols.map(encodeURIComponent).join(",")}`;
    const r = await getJson(deps, "massive", url, { headers: headers(), timeoutMs: 12000 });
    if (!r.ok) {
      deps.warn?.(`massive snapshot status=${r.status} tickers=${symbols.length}`);
      return out;
    }
    for (const t of ((r.body as { tickers?: Snap[] } | null)?.tickers ?? []) as Snap[]) {
      const s = t.ticker?.toUpperCase();
      if (!s) continue;
      const price = positive(t.min?.c) ?? positive(t.day?.c) ?? positive(t.prevDay?.c);
      out[s] = {
        symbol: s,
        price,
        currency: "USD",
        asOf: isoInstant(t.updated),
        high: null,
        highDate: null,
        highKind: null,
        high24h: null,
        changePct: signed(t.todaysChangePerc),
      };
    }
    return out;
  }

  /** Máximo de las barras diarias del último año, con la fecha del día en que ocurrió. */
  async function high52w(symbol: string): Promise<{ high: number; date: string | null } | null> {
    const to = now();
    const from = new Date(to.getTime() - 365 * 24 * 60 * 60 * 1000);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    const url = `${base}/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${d(from)}/${d(to)}?adjusted=true&sort=asc&limit=400`;
    const r = await getJson(deps, "massive", url, { headers: headers(), timeoutMs: 12000 });
    if (!r.ok) return null;
    let best: { high: number; date: string | null } | null = null;
    for (const bar of ((r.body as { results?: { h?: number; t?: number }[] } | null)?.results ??
      []) as { h?: number; t?: number }[]) {
      const h = positive(bar.h);
      if (h !== null && (best === null || h > best.high)) best = { high: h, date: isoDate(bar.t) };
    }
    return best;
  }

  const norm = (symbols: string[]) => [...new Set(symbols.map((s) => s.trim().toUpperCase()))];

  return {
    id: "massive",
    kinds: ["stock"],
    getQuotes: (symbols) => snapshot(norm(symbols)),
    async getHighlights(symbols) {
      const out = await snapshot(norm(symbols));
      // Solo se busca el máximo de lo que SÍ tuvo precio: de un símbolo que Massive no conoce no
      // tiene sentido pedir un año de barras.
      for (const s of Object.keys(out)) {
        const row = out[s];
        if (!row || row.price === null) continue;
        const h = await high52w(s);
        if (h) out[s] = { ...row, high: h.high, highDate: h.date, highKind: "52w" };
      }
      return out;
    },
  };
}
