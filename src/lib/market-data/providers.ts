/**
 * Proveedores de precios. Cada función intenta una fuente y devuelve
 * { price, currency } o null. Con timeout, sin filtrar secretos en logs.
 *
 * Stocks/ETF: Finnhub → AlphaVantage → Yahoo Finance.
 * Cripto: Binance → CoinGecko.
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export type Quote = { price: number; currency: string; provider: string };

const TIMEOUT_MS = 6000;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- Stocks / ETF ----------
export async function finnhub(symbol: string): Promise<Quote | null> {
  const token = getServerEnv().FINNHUB_TOKEN;
  if (!token) return null;
  const data = (await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
  )) as { c?: number } | null;
  const price = data ? num(data.c) : null;
  return price ? { price, currency: "USD", provider: "finnhub" } : null;
}

export async function alphaVantage(symbol: string): Promise<Quote | null> {
  const key = getServerEnv().ALPHA_VANTAGE_KEY;
  if (!key) return null;
  const data = (await fetchJson(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
  )) as { "Global Quote"?: Record<string, string> } | null;
  const price = data?.["Global Quote"] ? num(data["Global Quote"]["05. price"]) : null;
  return price ? { price, currency: "USD", provider: "alphavantage" } : null;
}

export async function yahoo(symbol: string): Promise<Quote | null> {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; CompoundAscend/1.0)" };
  for (const host of ["query2", "query1"]) {
    const data = (await fetchJson(
      `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { headers },
    )) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; currency?: string } }[] };
    } | null;
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta ? num(meta.regularMarketPrice) : null;
    if (price) return { price, currency: meta?.currency ?? "USD", provider: "yahoo" };
  }
  return null;
}

// ---------- Cripto ----------
export async function binance(ticker: string): Promise<Quote | null> {
  const t = ticker.toUpperCase();
  for (const quote of ["USDT", "USDC", "BUSD"]) {
    const data = (await fetchJson(
      `https://api.binance.com/api/v3/ticker/price?symbol=${t}${quote}`,
    )) as { price?: string } | null;
    const price = data ? num(data.price) : null;
    if (price) return { price, currency: "USD", provider: "binance" };
  }
  return null;
}

// Ticker → id de CoinGecko para la lista curada (rápido, sin red).
const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  LINK: "chainlink",
  MATIC: "matic-network",
  DOT: "polkadot",
  LTC: "litecoin",
  BNB: "binancecoin",
  TRX: "tron",
  SUI: "sui",
  APT: "aptos",
};

// Cache en memoria de resoluciones dinámicas (ticker → id) para el resto.
const resolvedIds = new Map<string, string>();

/** Resuelve el id de CoinGecko para un ticker no listado, vía /search. */
async function resolveCoingeckoId(ticker: string): Promise<string | null> {
  const key = ticker.toUpperCase();
  if (COINGECKO_IDS[key]) return COINGECKO_IDS[key]!;
  if (resolvedIds.has(key)) return resolvedIds.get(key)!;
  const data = (await fetchJson(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(ticker)}`,
  )) as { coins?: { id: string; symbol: string; market_cap_rank: number | null }[] } | null;
  const coins = data?.coins ?? [];
  const match = coins
    .filter((c) => c.symbol?.toUpperCase() === key)
    .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))[0];
  if (!match) return null;
  resolvedIds.set(key, match.id);
  return match.id;
}

export async function coingecko(ticker: string): Promise<Quote | null> {
  const id = await resolveCoingeckoId(ticker);
  if (!id) return null;
  const data = (await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`,
  )) as Record<string, { usd?: number }> | null;
  const price = data?.[id] ? num(data[id]!.usd) : null;
  return price ? { price, currency: "USD", provider: "coingecko" } : null;
}

export function logProviderMiss(symbol: string, assetType: string): void {
  logger.warn("market-data: sin precio en ningún proveedor", { assetType, len: symbol.length });
}
