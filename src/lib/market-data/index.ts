/**
 * Orquestador de precios: cadena de proveedores con cache y fallback.
 * Stocks/ETF: Finnhub → AlphaVantage → Yahoo.  Cripto: CoinGecko → Binance.
 */
import "server-only";
import { priceCache, TTL } from "@/lib/market-data/cache";
import {
  finnhub,
  alphaVantage,
  yahoo,
  binance,
  coingecko,
  coingeckoBatch,
  coingeckoHighlights,
  finnhubHighlights,
  yahooHistory,
  coingeckoHistory,
  logProviderMiss,
  type Quote,
  type Highlights,
} from "@/lib/market-data/providers";
import { isValidSymbol } from "@/lib/market-data/symbol";

export { isValidSymbol };
export type AssetType = "stock" | "etf" | "crypto";
export type MarketPrice = Quote & { symbol: string; assetType: AssetType; cached: boolean };
import { persistMarketPrice } from "@/lib/market-data/persist";

const STOCK_CHAIN = [finnhub, alphaVantage, yahoo];
const CRYPTO_CHAIN = [coingecko, binance];

// Single-flight: coalesce ráfagas idénticas (mismo set de símbolos en vuelo) → un render = 1 batch,
// no N. Clave = set ordenado; el promise se comparte y se limpia al resolver.
const cryptoBatchInFlight = new Map<string, Promise<Record<string, MarketPrice>>>();

/**
 * Precios de VARIAS cripto en 1-2 llamadas (batch a CoinGecko) — reemplaza la ráfaga de una-por-
 * moneda que colgaba a la Demo key. Sirve los cacheados (TTL corto) y batchea solo los que faltan;
 * cachea + persiste cada resultado. Single-flight: dos renders concurrentes con el mismo set
 * comparten UNA llamada. Devuelve un mapa SÍMBOLO(MAYÚS) → MarketPrice (solo los que respondieron).
 */
export async function getCryptoPricesBatch(rawSymbols: string[]): Promise<Record<string, MarketPrice>> {
  const symbols = [...new Set(rawSymbols.map((s) => s.trim().toUpperCase()).filter(isValidSymbol))];
  const out: Record<string, MarketPrice> = {};

  // 1) Cache hits (por símbolo) → no re-piden.
  const need: string[] = [];
  for (const s of symbols) {
    const cached = priceCache.get<Quote>(`price:crypto:${s}`);
    if (cached) out[s] = { ...cached, symbol: s, assetType: "crypto", cached: true };
    else need.push(s);
  }
  if (need.length === 0) return out;

  // 2) Los que faltan: UNA llamada batch, coalescida por single-flight.
  const key = [...need].sort().join(",");
  let flight = cryptoBatchInFlight.get(key);
  if (!flight) {
    flight = (async () => {
      const quotes = await coingeckoBatch(need);
      const mapped: Record<string, MarketPrice> = {};
      for (const [s, q] of Object.entries(quotes)) {
        priceCache.set(`price:crypto:${s}`, q, TTL.crypto);
        persistMarketPrice(s, "crypto", q.price, q.currency, q.provider);
        mapped[s] = { ...q, symbol: s, assetType: "crypto", cached: false };
      }
      return mapped;
    })();
    cryptoBatchInFlight.set(key, flight);
    void flight.finally(() => cryptoBatchInFlight.delete(key));
  }
  Object.assign(out, await flight);
  return out;
}

export async function getMarketPrice(
  rawSymbol: string,
  assetType: AssetType,
): Promise<MarketPrice | null> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!isValidSymbol(symbol)) return null;

  const ttl = assetType === "crypto" ? TTL.crypto : TTL.stock;
  const cacheKey = `price:${assetType}:${symbol}`;
  const cached = priceCache.get<Quote>(cacheKey);
  if (cached) return { ...cached, symbol, assetType, cached: true };

  const chain = assetType === "crypto" ? CRYPTO_CHAIN : STOCK_CHAIN;
  for (const provider of chain) {
    const quote = await provider(symbol);
    if (quote) {
      priceCache.set(cacheKey, quote, ttl);
      // Persiste en BD para historial y acceso offline (fire-and-forget).
      persistMarketPrice(symbol, assetType, quote.price, quote.currency, quote.provider);
      return { ...quote, symbol, assetType, cached: false };
    }
  }
  logProviderMiss(symbol, assetType);
  return null;
}

/**
 * Serie diaria (~1 mes) para el sparkline del Monitor. Best-effort: Yahoo para
 * stock/ETF, CoinGecko para cripto; [] si no hay datos. Cacheada aparte del
 * precio (TTL más largo) porque cambia poco intradía.
 */
export async function getMarketSparkline(
  rawSymbol: string,
  assetType: AssetType,
): Promise<number[]> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!isValidSymbol(symbol)) return [];

  const cacheKey = `spark:${assetType}:${symbol}`;
  const cached = priceCache.get<number[]>(cacheKey);
  if (cached) return cached;

  const series = assetType === "crypto" ? await coingeckoHistory(symbol) : await yahooHistory(symbol);
  if (series.length >= 2) priceCache.set(cacheKey, series, TTL.sparkline);
  return series;
}

export type { Highlights };

/**
 * Máximos + precio para el asesor: cripto → ATH real (CoinGecko); acción/ETF → máximo de 52 semanas
 * (Finnhub), etiquetado como tal (NO como ATH). Cacheado con el mismo TTL que el precio para no
 * sumar latencia/503, y best-effort: si el proveedor no responde en el timeout, devuelve null y el
 * llamador lo dice. NUNCA inventa el máximo.
 */
export async function getMarketHighlights(
  rawSymbol: string,
  assetType: AssetType,
): Promise<Highlights | null> {
  const symbol = rawSymbol.trim().toUpperCase();
  if (!isValidSymbol(symbol)) return null;
  const freshKey = `highlights:${assetType}:${symbol}`;
  const staleKey = `highlights:stale:${assetType}:${symbol}`;

  // 1) Fresco (TTL de horas: el máximo se mueve lento) → hit ⇒ ~1 llamada/moneda/día.
  const cached = priceCache.get<Highlights>(freshKey);
  if (cached) return cached;

  // 2) Fetch. Con dato bueno, refresca fresco (6 h) + "último bueno" (7 d).
  const h =
    assetType === "crypto" ? await coingeckoHighlights(symbol) : await finnhubHighlights(symbol);
  if (h && (h.price !== null || h.high !== null)) {
    priceCache.set(freshKey, h, TTL.highlights);
    priceCache.set(staleKey, h, TTL.highlightsStale);
    return h;
  }

  // 3) 429/fallo → serví el STALE si existe (mejor un máximo de ayer que nada); si no hay, null
  //    y el llamador da el mensaje honesto ("no pude leer ahora").
  return priceCache.get<Highlights>(staleKey) ?? h ?? null;
}

export type SymbolResult = { symbol: string; description: string };

/** Búsqueda de símbolos (Finnhub → AlphaVantage), cacheada 5 min. */
export async function searchSymbols(query: string): Promise<SymbolResult[]> {
  const q = query.trim();
  if (q.length < 1 || q.length > 40) return [];
  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = priceCache.get<SymbolResult[]>(cacheKey);
  if (cached) return cached;

  const results = await searchFinnhub(q);
  priceCache.set(cacheKey, results, TTL.search);
  return results;
}

async function searchFinnhub(q: string): Promise<SymbolResult[]> {
  const { getServerEnv } = await import("@/lib/env");
  const token = getServerEnv().FINNHUB_TOKEN;
  if (!token) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/search?q=${encodeURIComponent(q)}&token=${token}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: { symbol: string; description: string }[] };
    return (data.result ?? [])
      .slice(0, 10)
      .map((r) => ({ symbol: r.symbol, description: r.description }));
  } catch {
    return [];
  }
}
