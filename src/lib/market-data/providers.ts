/**
 * Proveedores de precios. Cada función intenta una fuente y devuelve
 * { price, currency } o null. Con timeout, sin filtrar secretos en logs.
 *
 * Stocks/ETF: Finnhub → AlphaVantage → Yahoo Finance.
 * Cripto: Binance → CoinGecko.
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export type Quote = {
  price: number;
  currency: string;
  provider: string;
  /** Variación porcentual del día (-/+), si el proveedor la expone. */
  changePct?: number;
};

// 3 s por proveedor: con 3 proveedores en cadena el peor caso por simbolo baja
// de 18 s a 9 s; los hits reales responden muy por debajo de 3 s.
const TIMEOUT_MS = 3000;

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

/** Como num pero admite 0 y negativos (variación %, que puede caer). */
function signedNum(v: unknown): number | undefined {
  const raw = typeof v === "string" ? parseFloat(v.replace(/%/g, "")) : v;
  const n = typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// ---------- Stocks / ETF ----------
export async function finnhub(symbol: string): Promise<Quote | null> {
  const token = getServerEnv().FINNHUB_TOKEN;
  if (!token) return null;
  const data = (await fetchJson(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`,
  )) as { c?: number; dp?: number } | null;
  const price = data ? num(data.c) : null;
  return price ? { price, currency: "USD", provider: "finnhub", changePct: signedNum(data?.dp) } : null;
}

export async function alphaVantage(symbol: string): Promise<Quote | null> {
  const key = getServerEnv().ALPHA_VANTAGE_KEY;
  if (!key) return null;
  const data = (await fetchJson(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
  )) as { "Global Quote"?: Record<string, string> } | null;
  const gq = data?.["Global Quote"];
  const price = gq ? num(gq["05. price"]) : null;
  return price
    ? { price, currency: "USD", provider: "alphavantage", changePct: signedNum(gq?.["10. change percent"]) }
    : null;
}

export async function yahoo(symbol: string): Promise<Quote | null> {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; CompoundAscend/1.0)" };
  for (const host of ["query2", "query1"]) {
    const data = (await fetchJson(
      `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`,
      { headers },
    )) as {
      chart?: {
        result?: {
          meta?: {
            regularMarketPrice?: number;
            currency?: string;
            previousClose?: number;
            chartPreviousClose?: number;
          };
        }[];
      };
    } | null;
    const meta = data?.chart?.result?.[0]?.meta;
    const price = meta ? num(meta.regularMarketPrice) : null;
    if (price) {
      const prev = meta?.previousClose ?? meta?.chartPreviousClose;
      const changePct =
        prev && prev > 0 ? ((price - prev) / prev) * 100 : undefined;
      return { price, currency: meta?.currency ?? "USD", provider: "yahoo", changePct };
    }
  }
  return null;
}

// ---------- Cripto ----------
export async function binance(ticker: string): Promise<Quote | null> {
  const t = ticker.toUpperCase();
  for (const quote of ["USDT", "USDC", "BUSD"]) {
    // 24hr expone último precio + variación % del día en una sola llamada.
    const data = (await fetchJson(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${t}${quote}`,
    )) as { lastPrice?: string; priceChangePercent?: string } | null;
    const price = data ? num(data.lastPrice) : null;
    if (price)
      return { price, currency: "USD", provider: "binance", changePct: signedNum(data?.priceChangePercent) };
  }
  return null;
}

/**
 * Ticker → id de CoinGecko, lista CURADA (rápido, sin red, sin colisiones de símbolo).
 *
 * Para sumar uno: VERIFICÁ el id contra la API real ANTES de hardcodearlo — NO de
 * memoria. Un id equivocado mapea al precio de OTRA moneda (la misma colisión que esto
 * arregla). Consultá `https://api.coingecko.com/api/v3/search?query=<TICKER>`, elegí el
 * coin cuyo `symbol` coincide Y con mejor `market_cap_rank` (el proyecto real), y usá ESE id.
 */
export const COINGECKO_IDS: Record<string, string> = {
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
  // Añadidos — verificados vía /search contra la API real (id + market_cap_rank):
  ONDO: "ondo-finance", // Ondo (Ondo Finance) · rank ~41
  KMNO: "kamino", // Kamino · rank ~278
  JUP: "jupiter-exchange-solana", // Jupiter en Solana · rank ~87 (NO "jupiter" = "Jupiter Project" muerto, rank ~4424)
  AERO: "aerodrome-finance", // Aerodrome Finance (Base) · rank ~109
};

/**
 * Elige el mejor coin por símbolo entre los resultados de /search. Puro y testeable.
 * CRITERIO (anti-colisión): se DESCARTAN los matches con `market_cap_rank` null —
 * tokens muertos/scam que reusan un símbolo popular no tienen market cap; elegir uno
 * mapearía el ticker a basura. De los que quedan (con market cap real) se toma el de
 * mejor rank. Si no queda ninguno válido → null (mejor sin precio que un precio falso).
 */
export function pickCoingeckoMatch(
  coins: { id: string; symbol: string; market_cap_rank: number | null }[],
  ticker: string,
): string | null {
  const key = ticker.toUpperCase();
  const match = coins
    .filter((c) => c.symbol?.toUpperCase() === key && c.market_cap_rank != null)
    .sort((a, b) => (a.market_cap_rank as number) - (b.market_cap_rank as number))[0];
  return match?.id ?? null;
}

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
  const id = pickCoingeckoMatch(data?.coins ?? [], ticker);
  if (!id) return null;
  resolvedIds.set(key, id);
  return id;
}

export async function coingecko(ticker: string): Promise<Quote | null> {
  const id = await resolveCoingeckoId(ticker);
  if (!id) return null;
  const data = (await fetchJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`,
  )) as Record<string, { usd?: number; usd_24h_change?: number }> | null;
  const row = data?.[id];
  const price = row ? num(row.usd) : null;
  return price ? { price, currency: "USD", provider: "coingecko", changePct: signedNum(row?.usd_24h_change) } : null;
}

/** Máximos de un activo (para el asesor). `athKind` distingue ATH real vs máx. 52 semanas. */
export type Highlights = {
  price: number | null;
  currency: string;
  high: number | null; // ATH (cripto) o máx. 52 semanas (acción/ETF)
  highDate: string | null; // fecha del máximo (YYYY-MM-DD si el proveedor la da)
  highKind: "ath" | "52w" | null; // qué representa `high` (honestidad por clase de activo)
};

/**
 * CoinGecko /coins/markets: precio + ATH REAL + fecha del ATH (all-time-high verdadero). Best-effort:
 * null en los campos que falten. La cripto SÍ tiene ATH real, por eso highKind='ath'.
 */
export async function coingeckoHighlights(ticker: string): Promise<Highlights | null> {
  const id = await resolveCoingeckoId(ticker);
  if (!id) return null;
  const data = (await fetchJson(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}`,
  )) as { current_price?: number; ath?: number; ath_date?: string }[] | null;
  const row = data?.[0];
  if (!row) return null;
  return {
    price: num(row.current_price),
    currency: "USD",
    high: num(row.ath),
    highDate: typeof row.ath_date === "string" ? row.ath_date.slice(0, 10) : null,
    highKind: num(row.ath) !== null ? "ath" : null,
  };
}

/**
 * Finnhub: precio (/quote) + MÁXIMO DE 52 SEMANAS (/stock/metric). NO es un ATH: las acciones no
 * exponen un all-time-high gratis, así que devolvemos el 52-sem ETIQUETADO como tal (highKind='52w')
 * para no mentir. Best-effort.
 */
export async function finnhubHighlights(symbol: string): Promise<Highlights | null> {
  const token = getServerEnv().FINNHUB_TOKEN;
  if (!token) return null;
  const [q, m] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${token}`),
    fetchJson(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${token}`),
  ]);
  const price = num((q as { c?: number } | null)?.c);
  const metric = (m as { metric?: Record<string, unknown> } | null)?.metric ?? {};
  const high = num(metric["52WeekHigh"]);
  const hd = metric["52WeekHighDate"];
  if (price === null && high === null) return null;
  return {
    price,
    currency: "USD",
    high,
    highDate: typeof hd === "string" ? hd.slice(0, 10) : null,
    highKind: high !== null ? "52w" : null,
  };
}

// ---------- Historial (serie diaria, para sparkline) ----------

const SPARK_POINTS = 30;

/** Cierres diarios (~1 mes) de un stock/ETF vía Yahoo. [] si no hay datos. */
export async function yahooHistory(symbol: string): Promise<number[]> {
  const headers = { "User-Agent": "Mozilla/5.0 (compatible; CompoundAscend/1.0)" };
  for (const host of ["query2", "query1"]) {
    const data = (await fetchJson(
      `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
      { headers },
    )) as {
      chart?: { result?: { indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
    } | null;
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (closes) {
      const series = closes.filter((c): c is number => typeof c === "number" && c > 0);
      if (series.length >= 2) return series.slice(-SPARK_POINTS);
    }
  }
  return [];
}

/** Precios diarios (~1 mes) de una cripto vía CoinGecko. [] si no hay datos. */
export async function coingeckoHistory(ticker: string): Promise<number[]> {
  const id = await resolveCoingeckoId(ticker);
  if (!id) return [];
  const data = (await fetchJson(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=30&interval=daily`,
  )) as { prices?: [number, number][] } | null;
  const series = (data?.prices ?? [])
    .map((p) => p[1])
    .filter((n): n is number => typeof n === "number" && n > 0);
  return series.length >= 2 ? series.slice(-SPARK_POINTS) : [];
}

export function logProviderMiss(symbol: string, assetType: string): void {
  logger.warn("market-data: sin precio en ningún proveedor", { assetType, len: symbol.length });
}
