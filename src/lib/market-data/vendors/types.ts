/**
 * Contrato ÚNICO de un proveedor de mercado. Lo implementan massive, twelvedata, finnhub y
 * coingecko; el colector (GitHub Actions) y el camino en vivo (Vercel) hablan solo con esto.
 *
 * Todo el directorio `vendors/` es TypeScript "borrable": sin enums, sin namespaces, imports de
 * tipos con `import type` y rutas relativas CON extensión `.ts`. Es lo que permite que el
 * colector corra con `node scripts/market-data-collect.ts` en el runner (Node ≥22.18 quita los
 * tipos solo) sin instalar dependencias ni compilar, y que el mismo código lo use Next.
 * Por eso tampoco importa nada de `@/` ni paquetes de npm.
 */

/** Tipo de mercado que atiende un proveedor. El store distingue "stock" y "etf"; acá son lo mismo. */
export type MarketKind = "stock" | "crypto";

export type VendorId = "massive" | "twelvedata" | "finnhub" | "coingecko";

/** Precio + máximo de un símbolo, en la forma que el store sabe guardar. */
export type VendorHighlight = {
  /** El símbolo tal cual lo pidió quien llamó (MAYÚSCULAS), no el que usa el proveedor. */
  symbol: string;
  price: number | null;
  currency: string;
  /** Cuándo es el dato según el proveedor (ISO). null si no lo dice. */
  asOf: string | null;
  /** ATH real (cripto) o máximo de 52 semanas (acción/ETF). `highKind` dice cuál. */
  high: number | null;
  highDate: string | null; // YYYY-MM-DD
  highKind: "ath" | "52w" | null;
  /** Máximo del día; solo lo da CoinGecko hoy. */
  high24h: number | null;
  changePct?: number;
  /** Solo cripto. Viajan en el resultado aunque el store no tenga columna para ellos. */
  atl?: number | null;
  atlDate?: string | null;
  marketCapRank?: number | null;
};

export interface MarketVendor {
  readonly id: VendorId;
  readonly kinds: readonly MarketKind[];
  /** Solo precio. Mismo resultado que getHighlights pero sin pedir el máximo si cuesta aparte. */
  getQuotes(symbols: string[]): Promise<Record<string, VendorHighlight>>;
  /** Precio + máximo (ATH o 52 semanas) + fecha. */
  getHighlights(symbols: string[]): Promise<Record<string, VendorHighlight>>;
}

/** Plan de CoinGecko: decide host y header. Una llave Pro mandada como Demo la rechazan. */
export type CoingeckoPlan = "demo" | "pro";

/** Todo lo que un proveedor necesita del mundo. Se inyecta: así se testea sin red ni env. */
export type VendorDeps = {
  fetch: typeof fetch;
  keys: {
    massive?: string;
    twelvedata?: string;
    finnhub?: string;
    coingecko?: string;
  };
  coingeckoPlan: CoingeckoPlan;
  /** Registra el costo de cada llamada (créditos del plan, no requests). Ver budget.ts. */
  charge?: (vendor: VendorId, credits: number) => void;
  /** Aviso no fatal (el colector lo imprime; el camino en vivo lo manda al logger). */
  warn?: (msg: string) => void;
};
