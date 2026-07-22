/**
 * Tasas de cambio en vivo (unidades por 1 USD), con cache y respaldo estático.
 *
 * Cadena de proveedores sin API key, ambos soportan CRC/COP:
 *   1) open.er-api.com   2) currency-api (fawazahmed, vía jsDelivr).
 * Si ambos fallan, se usan las tasas estáticas de `FX_PER_USD` (sin cachear,
 * para reintentar en la próxima carga). Las divisas no se mueven rápido: TTL 6 h.
 *
 * Uso: `const rates = await getFxRates(); convertCurrency(x, from, to, rates)`.
 */
import "server-only";
import { cache } from "react";
import { priceCache } from "@/lib/market-data/cache";
import { FX_PER_USD, completeRateTable, btcPerUsd } from "@/lib/fx";
import { logger } from "@/lib/logger";

const CACHE_KEY = "fx:usd";
const TTL_SECONDS = 6 * 60 * 60;
const TIMEOUT_MS = 6000;

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** open.er-api.com → { result: "success", rates: { USD:1, CRC:..., ... } } */
async function erApi(): Promise<Record<string, number> | null> {
  const data = (await fetchJson("https://open.er-api.com/v6/latest/USD")) as {
    result?: string;
    rates?: Record<string, number>;
  } | null;
  return data?.result === "success" && data.rates ? data.rates : null;
}

/** currency-api → { usd: { crc:..., eur:... } } (claves en minúscula). */
async function currencyApi(): Promise<Record<string, number> | null> {
  const data = (await fetchJson(
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
  )) as { usd?: Record<string, number> } | null;
  if (!data?.usd) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(data.usd)) out[k.toUpperCase()] = v;
  return out;
}

/**
 * Tasas FIAT (por USD). Cacheada 6 h (las divisas no se mueven rápido). Nunca lanza: ante
 * fallo total devuelve el respaldo estático. BTC NO se cachea aquí (se mueve rápido); se
 * añade fresco en getFxRates.
 */
async function _getFiatRates(): Promise<Record<string, number>> {
  const cached = priceCache.get<Record<string, number>>(CACHE_KEY);
  if (cached) return cached;

  for (const provider of [erApi, currencyApi]) {
    const raw = await provider();
    if (raw) {
      const table = completeRateTable(raw);
      priceCache.set(CACHE_KEY, table, TTL_SECONDS);
      return table;
    }
  }

  logger.warn("fx-rates: proveedores sin respuesta; usando tasas estáticas");
  return { ...FX_PER_USD };
}

/**
 * BTC/USD del FEED CRIPTO (Binance/CoinGecko vía getMarketPrice), la MISMA fuente que valora
 * los holdings BTC del portafolio → un solo precio de BTC en toda la app. Devuelve la tasa
 * (unidades BTC por 1 USD) y si es `stale` (feed caído → respaldo estático, no vivo).
 */
export async function getBtcUsdInfo(): Promise<{
  usdPrice: number | null;
  perUsd: number;
  stale: boolean;
}> {
  const { getMarketPrice } = await import("@/lib/market-data");
  const quote = await getMarketPrice("BTC", "crypto").catch(() => null);
  const { rate, stale } = btcPerUsd(quote?.price ?? null);
  if (stale) logger.warn("fx-rates: BTC sin precio vivo; tasa estática marcada stale");
  return { usdPrice: quote?.price ?? null, perUsd: rate, stale };
}

/**
 * Tabla de tasas (por USD) lista para `convertCurrency`: fiat (cache 6 h) + BTC VIVO del feed
 * cripto (fresco cada request, no cae en el cache 6 h del fiat). Nunca lanza.
 */
async function _getFxRates(): Promise<Record<string, number>> {
  const fiat = await _getFiatRates();
  const { perUsd } = await getBtcUsdInfo();
  return { ...fiat, BTC: perUsd };
}

/** Dedup por request (React cache): se llamaba getFxRates varias veces por render. */
export const getFxRates = cache(_getFxRates);
