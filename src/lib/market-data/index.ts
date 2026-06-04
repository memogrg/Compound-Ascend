/**
 * Orquestador de precios: cadena de proveedores con cache y fallback.
 * Stocks/ETF: Finnhub → AlphaVantage → Yahoo.  Cripto: Binance → CoinGecko.
 */
import "server-only";
import { priceCache, TTL } from "@/lib/market-data/cache";
import {
  finnhub,
  alphaVantage,
  yahoo,
  binance,
  coingecko,
  logProviderMiss,
  type Quote,
} from "@/lib/market-data/providers";
import { isValidSymbol } from "@/lib/market-data/symbol";

export { isValidSymbol };
export type AssetType = "stock" | "etf" | "crypto";
export type MarketPrice = Quote & { symbol: string; assetType: AssetType; cached: boolean };
import { persistMarketPrice } from "@/lib/market-data/persist";

const STOCK_CHAIN = [finnhub, alphaVantage, yahoo];
const CRYPTO_CHAIN = [binance, coingecko];

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
