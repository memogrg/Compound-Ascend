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

/** Unidades de cada moneda por 1 USD (aproximado, ~2026). */
export const FX_PER_USD: Record<string, number> = {
  USD: 1,
  CRC: 510,
  EUR: 0.92,
  MXN: 18.5,
  COP: 4000,
  GBP: 0.79,
};

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
