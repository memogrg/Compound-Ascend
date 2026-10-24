/**
 * Capa de proveedores de mercado. La usan los DOS caminos que traen precios:
 *
 * - el colector (`scripts/market-data-collect.ts`, GitHub Actions) — lee `process.env`, que son
 *   los secrets y variables del Action;
 * - el camino en vivo de la app (`providers.ts`, Vercel) — lee `getServerEnv()`, que es la env de
 *   Vercel.
 *
 * Las llaves se cargan en los DOS lugares por separado. Una llave vencida en uno solo NO se nota
 * mirando el otro: pasó con Finnhub, que estuvo diez días dando 401 en el Action mientras la app
 * seguía mostrando precios frescos con el token de Vercel. Ver docs/market-data-feed.md.
 */
import { parseChain, createVendor } from "./chain.ts";
import { parseExchangeSuffixes } from "./twelvedata.ts";
import type { CoingeckoPlan, MarketKind, MarketVendor, VendorDeps, VendorId } from "./types.ts";

export type {
  CoingeckoPlan,
  MarketKind,
  MarketVendor,
  VendorDeps,
  VendorHighlight,
  VendorId,
} from "./types.ts";
export { coingeckoApi, COINGECKO_IDS, pickCoingeckoMatch } from "./coingecko.ts";
export { toTwelveSymbol, parseExchangeSuffixes } from "./twelvedata.ts";
export {
  parseChain,
  createVendor,
  fetchWithFallback,
  missingKeys,
  VENDOR_KEY_ENV,
  type ChainRow,
  type ChainResult,
  type ChainAttempt,
} from "./chain.ts";
export {
  createBudget,
  budgetConfigFromEnv,
  budgetReport,
  type BudgetLine,
  type BudgetConfig,
} from "./budget.ts";
export { buildStoreRow, type StoreRow } from "./store-row.ts";

/** Las variables que esta capa lee. Mismos nombres en el Action y en Vercel. */
export type MarketEnv = {
  MARKET_PROVIDER_STOCKS?: string;
  MARKET_PROVIDER_CRYPTO?: string;
  MARKET_EXCHANGE_SUFFIXES?: string;
  MASSIVE_API_KEY?: string;
  TWELVEDATA_API_KEY?: string;
  FINNHUB_TOKEN?: string;
  COINGECKO_API_KEY?: string;
  COINGECKO_API_PLAN?: string;
};

export type MarketConfig = {
  chains: Record<MarketKind, VendorId[]>;
  keys: VendorDeps["keys"];
  coingeckoPlan: CoingeckoPlan;
  exchangeSuffixes: Record<string, string>;
};

/** De la env (del Action o de Vercel, da igual) a la configuración de la capa. Puro. */
export function marketConfigFromEnv(env: MarketEnv, warn?: (msg: string) => void): MarketConfig {
  const vacio = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    chains: {
      stock: parseChain(env.MARKET_PROVIDER_STOCKS, "stock", warn),
      crypto: parseChain(env.MARKET_PROVIDER_CRYPTO, "crypto", warn),
    },
    keys: {
      massive: vacio(env.MASSIVE_API_KEY),
      twelvedata: vacio(env.TWELVEDATA_API_KEY),
      finnhub: vacio(env.FINNHUB_TOKEN),
      coingecko: vacio(env.COINGECKO_API_KEY),
    },
    coingeckoPlan: env.COINGECKO_API_PLAN?.trim().toLowerCase() === "pro" ? "pro" : "demo",
    exchangeSuffixes: parseExchangeSuffixes(env.MARKET_EXCHANGE_SUFFIXES),
  };
}

/** Instancia la cadena de un tipo de activo, en el orden configurado. */
export function buildChain(
  kind: MarketKind,
  cfg: MarketConfig,
  deps: Omit<VendorDeps, "keys" | "coingeckoPlan">,
): MarketVendor[] {
  const full: VendorDeps = { ...deps, keys: cfg.keys, coingeckoPlan: cfg.coingeckoPlan };
  return cfg.chains[kind].map((id) =>
    createVendor(id, full, { exchangeSuffixes: cfg.exchangeSuffixes }),
  );
}
