/**
 * Proveedores de precios del camino EN VIVO (Vercel). Cada función intenta una fuente y devuelve
 * { price, currency } o null. Con timeout, sin filtrar secretos en logs.
 *
 * Stocks/ETF: la cadena configurada (MARKET_PROVIDER_STOCKS) → AlphaVantage → Yahoo Finance.
 * Cripto: CoinGecko (plan según COINGECKO_API_PLAN) → Binance.
 *
 * Los proveedores pagos viven en `vendors/`, que comparte con el colector de GitHub Actions: acá
 * solo se los llama con la env de Vercel.
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  buildChain,
  coingeckoApi,
  fetchWithFallback,
  marketConfigFromEnv,
  COINGECKO_IDS,
  pickCoingeckoMatch,
  type MarketKind,
} from "@/lib/market-data/vendors";

export { COINGECKO_IDS, pickCoingeckoMatch };

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
// CoinGecko desde serverless (cold start + red + endpoints más pesados como /coins/markets) supera
// los 3 s legítimamente → daba "timeout/error". Su propio timeout, más holgado: es una sola llamada
// (no cadena) y cabe de sobra en maxDuration=60. Con la Demo key además responde más rápido/estable.
const COINGECKO_TIMEOUT_MS = 8000;

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

/**
 * Fetch ÚNICO para CoinGecko. Recibe el PATH (`/simple/price?...`) y le pone host y header según
 * el plan: Demo → api.coingecko.com + x-cg-demo-api-key; Pro (cualquier plan pago) →
 * pro-api.coingecko.com + x-cg-pro-api-key. Sin llave, host público sin header (dev/local).
 * LOGUEA el status HTTP de cada llamada. Mismo contrato que fetchJson: json o null (con timeout).
 */
async function coingeckoFetch(path: string): Promise<unknown | null> {
  const env = getServerEnv();
  const key = env.COINGECKO_API_KEY;
  const plan = env.COINGECKO_API_PLAN?.trim().toLowerCase() === "pro" ? "pro" : "demo";
  const { base, headers } = coingeckoApi(plan, key);
  const url = `${base}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), COINGECKO_TIMEOUT_MS);
  const endpoint = path.split("?")[0] ?? path; // sin query (no filtra ids ni la key)
  // `auth` es un string NO sensible ("pro"/"demo"/"public") → inequívoco en logs y no lo redacta
  // el scrubber de secretos (a diferencia de un boolean que a veces se tapaba).
  const auth = key ? plan : "public";
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    // Instrumentación: status por llamada. 429 = rate limit; ver `cause` en el catch para red/timeout.
    logger.info("coingecko.call", { endpoint, status: res.status, auth });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    // Separa la causa REAL: AbortError = timeout (lento); el resto = error de red/bloqueo (hard).
    const cause =
      err instanceof Error && err.name === "AbortError"
        ? `timeout(${COINGECKO_TIMEOUT_MS}ms)`
        : "network";
    logger.warn("coingecko.call", { endpoint, status: cause, auth });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Como num pero admite 0 y negativos (variación %, que puede caer). */
function signedNum(v: unknown): number | undefined {
  const raw = typeof v === "string" ? parseFloat(v.replace(/%/g, "")) : v;
  const n = typeof raw === "number" ? raw : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// ---------- Stocks / ETF ----------
export async function alphaVantage(symbol: string): Promise<Quote | null> {
  const key = getServerEnv().ALPHA_VANTAGE_KEY;
  if (!key) return null;
  const data = (await fetchJson(
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
  )) as { "Global Quote"?: Record<string, string> } | null;
  const gq = data?.["Global Quote"];
  const price = gq ? num(gq["05. price"]) : null;
  return price
    ? {
        price,
        currency: "USD",
        provider: "alphavantage",
        changePct: signedNum(gq?.["10. change percent"]),
      }
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
      const changePct = prev && prev > 0 ? ((price - prev) / prev) * 100 : undefined;
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
      return {
        price,
        currency: "USD",
        provider: "binance",
        changePct: signedNum(data?.priceChangePercent),
      };
  }
  return null;
}

// COINGECKO_IDS y pickCoingeckoMatch viven en vendors/coingecko.ts (los comparte el colector) y se
// re-exportan arriba para no mover a quien ya los importa de acá.

// Cache en memoria de resoluciones dinámicas (ticker → id | null) para el resto. El valor `null`
// se CACHEA también: un ticker inexistente no debe re-pegar /search en cada consulta (y quemar el
// rate limit del free tier). El TTL evita que un miss por 429 transitorio quede pegado para siempre.
const resolvedIds = new Map<string, { id: string | null; at: number }>();
const RESOLVE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h: los ids de CoinGecko no cambian; refresco holgado.

/**
 * Resuelve el id de CoinGecko para un ticker no listado, vía /search. Cachea el resultado
 * (incluido el miss) con TTL. Un 429/timeout de /search devuelve null desde fetchJson → NO se
 * cachea como miss permanente (se reintenta en la próxima), para no quedar sin precio por un
 * rate-limit puntual. Los tickers curados (COINGECKO_IDS) no pasan por acá.
 */
async function resolveCoingeckoId(ticker: string): Promise<string | null> {
  const key = ticker.toUpperCase();
  if (COINGECKO_IDS[key]) return COINGECKO_IDS[key]!;
  const cached = resolvedIds.get(key);
  if (cached && Date.now() - cached.at < RESOLVE_TTL_MS) return cached.id;
  const data = (await coingeckoFetch(`/search?query=${encodeURIComponent(ticker)}`)) as {
    coins?: { id: string; symbol: string; market_cap_rank: number | null }[];
  } | null;
  // fetchJson devuelve null ante error de red / 429 / timeout: NO lo cacheamos como miss (reintenta).
  if (data === null) return null;
  const id = pickCoingeckoMatch(data.coins ?? [], ticker);
  resolvedIds.set(key, { id, at: Date.now() }); // cachea id o miss real (búsqueda que sí respondió)
  return id;
}

export async function coingecko(ticker: string): Promise<Quote | null> {
  const id = await resolveCoingeckoId(ticker);
  if (!id) return null;
  const data = (await coingeckoFetch(
    `/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`,
  )) as Record<string, { usd?: number; usd_24h_change?: number }> | null;
  const row = data?.[id];
  const price = row ? num(row.usd) : null;
  return price
    ? { price, currency: "USD", provider: "coingecko", changePct: signedNum(row?.usd_24h_change) }
    : null;
}

/**
 * Precios de VARIAS cripto en UNA sola llamada a CoinGecko (/simple/price?ids=id1,id2,…). Resuelve
 * cada símbolo a su id (mapa curado; /search solo para no listados, cacheado) y mapea la respuesta
 * de vuelta por SÍMBOLO. Colapsa la ráfaga de N-por-render a 1-2 requests → la Demo key (100/min)
 * sobra. Devuelve solo los que respondieron con precio válido (best-effort).
 */
export async function coingeckoBatch(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const idToSymbol = new Map<string, string>();
  const ids: string[] = [];
  for (const raw of symbols) {
    const s = raw.trim().toUpperCase();
    const id = await resolveCoingeckoId(s);
    if (id && !idToSymbol.has(id)) {
      idToSymbol.set(id, s);
      ids.push(id);
    }
  }
  if (ids.length === 0) return out;
  const data = (await coingeckoFetch(
    `/simple/price?ids=${ids.map(encodeURIComponent).join(",")}&vs_currencies=usd&include_24hr_change=true`,
  )) as Record<string, { usd?: number; usd_24h_change?: number }> | null;
  if (!data) return out;
  for (const [id, row] of Object.entries(data)) {
    const s = idToSymbol.get(id);
    const price = s ? num(row?.usd) : null;
    if (s && price)
      out[s] = {
        price,
        currency: "USD",
        provider: "coingecko",
        changePct: signedNum(row?.usd_24h_change),
      };
  }
  return out;
}

/** Máximos de un activo (para el asesor). `athKind` distingue ATH real vs máx. 52 semanas. */
export type Highlights = {
  price: number | null;
  currency: string;
  /** Cuándo se obtuvo el dato (ISO). Del store cuando viene del recolector; null si es vivo. */
  asOf?: string | null;
  high: number | null; // ATH (cripto) o máx. 52 semanas (acción/ETF)
  highDate: string | null; // fecha del máximo (YYYY-MM-DD si el proveedor la da)
  highKind: "ath" | "52w" | null; // qué representa `high` (honestidad por clase de activo)
};

// ---------- Cadena configurada (proveedores pagos, compartida con el colector) ----------

/**
 * La misma capa que usa el colector, con la env de VERCEL. `fetch` se resuelve en cada llamada (no
 * se captura al importar) para que los tests puedan reemplazarlo con vi.stubGlobal.
 */
function vendorDeps() {
  return {
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init)) as typeof fetch,
    warn: (msg: string) => logger.warn("market-data.vendor", { msg }),
  };
}

function vendorConfig() {
  return marketConfigFromEnv(getServerEnv(), (msg) => logger.warn("market-data.config", { msg }));
}

/**
 * Precio de una acción/ETF por la cadena de MARKET_PROVIDER_STOCKS. Sin configurar, esa cadena es
 * Finnhub, así que el comportamiento es el de antes. Es el primer eslabón de STOCK_CHAIN.
 */
export async function configuredStockQuote(symbol: string): Promise<Quote | null> {
  const r = await fetchWithFallback(
    buildChain("stock", vendorConfig(), vendorDeps()),
    [symbol],
    "quotes",
  );
  const row = r.rows[symbol.trim().toUpperCase()];
  if (!row || row.price === null) return null;
  return {
    price: row.price,
    currency: row.currency,
    provider: row.provider,
    changePct: row.changePct,
  };
}

/**
 * Precio + máximo por la cadena configurada del tipo de activo: ATH real en cripto, 52 semanas en
 * acciones/ETF. Es lo que usa getMarketHighlights cuando el store no tiene el dato fresco.
 */
export async function configuredHighlights(
  symbol: string,
  kind: MarketKind,
): Promise<Highlights | null> {
  const r = await fetchWithFallback(
    buildChain(kind, vendorConfig(), vendorDeps()),
    [symbol],
    "highlights",
  );
  const row = r.rows[symbol.trim().toUpperCase()];
  if (!row) return null;
  return {
    price: row.price,
    currency: row.currency,
    high: row.high,
    highDate: row.highDate,
    highKind: row.highKind,
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
  const data = (await coingeckoFetch(
    `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=30&interval=daily`,
  )) as { prices?: [number, number][] } | null;
  const series = (data?.prices ?? [])
    .map((p) => p[1])
    .filter((n): n is number => typeof n === "number" && n > 0);
  return series.length >= 2 ? series.slice(-SPARK_POINTS) : [];
}

export function logProviderMiss(symbol: string, assetType: string): void {
  logger.warn("market-data: sin precio en ningún proveedor", { assetType, len: symbol.length });
}
