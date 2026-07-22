/**
 * Conversión de moneda para normalizar agregados a una sola moneda.
 *
 * Por qué existe: sumar montos en monedas distintas (p. ej. un salario en USD
 * con un gasto en CRC) sin convertir produce cifras sin sentido. Toda suma de
 * dinero de la app debe hacerse sobre una sola moneda — la moneda principal del
 * usuario. Los montos por ítem se siguen mostrando en su propia moneda.
 *
 * Las tasas son una aproximación estática de respaldo (actualizar
 * periódicamente). La firma admite inyectar una tabla de tasas en vivo más
 * adelante sin cambiar los llamados: `convertCurrency(amount, from, to, rates)`.
 */

/** Monedas soportadas por la app (deben existir en FX_PER_USD). */
export const SUPPORTED_CURRENCIES = ["USD", "CRC", "EUR", "MXN", "COP", "GBP", "BTC"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** Monedas cripto: se capturan pero NO se ofrecen como moneda de display/principal
 *  (ver DISPLAY_CURRENCIES en format.ts), y se formatean con más decimales. */
export const CRYPTO_CURRENCIES = ["BTC"] as const;
export function isCryptoCurrency(code: string): boolean {
  return (CRYPTO_CURRENCIES as readonly string[]).includes(code);
}
/** Decimales de presentación por moneda: cripto 8 (satoshis), fiat 0 (default histórico). */
export function currencyDecimals(code: string): number {
  return isCryptoCurrency(code) ? 8 : 0;
}

/**
 * Unidades de cada moneda por 1 USD (aproximado, ~2026). Respaldo estático.
 * ⚠️ BTC es SOLO un último recurso si el feed cripto cae: se desactualiza rápido (BTC se
 * mueve mucho). El valor VIVO manda — getFxRates inyecta 1/precioBTCUSD del feed cripto
 * (misma fuente que el portafolio) y marca `stale` cuando cae al estático (ver btcPerUsd).
 */
export const FX_PER_USD: Record<string, number> = {
  USD: 1,
  CRC: 510,
  EUR: 0.92,
  MXN: 18.5,
  COP: 4000,
  GBP: 0.79,
  BTC: 1 / 60000, // ≈ 0.00001667 BTC/USD · respaldo estático desactualizado
};

/**
 * BTC/USD → unidades BTC por 1 USD, con flag de frescura. `liveUsdPrice` es el precio vivo
 * del feed cripto (getMarketPrice("BTC","crypto")); si es null (feed caído), cae al estático
 * PERO marcado `stale: true` — el estático NO se presenta como vivo. Puro y testeable.
 */
export function btcPerUsd(liveUsdPrice: number | null | undefined): { rate: number; stale: boolean } {
  if (typeof liveUsdPrice === "number" && Number.isFinite(liveUsdPrice) && liveUsdPrice > 0) {
    return { rate: 1 / liveUsdPrice, stale: false };
  }
  return { rate: FX_PER_USD.BTC!, stale: true };
}

/**
 * Completa una tabla de tasas (posiblemente parcial, de un proveedor en vivo)
 * con los valores estáticos de respaldo, validando cada tasa. Garantiza que
 * toda moneda soportada tenga una tasa positiva y que USD quede anclado en 1.
 */
export function completeRateTable(partial: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...FX_PER_USD };
  for (const code of SUPPORTED_CURRENCIES) {
    const v = partial[code];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[code] = v;
  }
  out.USD = 1;
  return out;
}

/**
 * Convierte `amount` de la moneda `from` a la moneda `to`.
 * Fallback seguro: si las monedas son iguales o alguna es desconocida, devuelve
 * el monto sin alterar (nunca rompe un agregado por una moneda no soportada).
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number> = FX_PER_USD,
): number {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  const f = rates[from];
  const t = rates[to];
  if (!f || !t) return amount;
  return (amount / f) * t;
}
