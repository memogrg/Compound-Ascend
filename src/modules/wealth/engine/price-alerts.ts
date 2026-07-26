/**
 * Lógica pura de las alertas de precio (sin IO). El servicio/cron hacen los
 * SELECT/UPDATE y el fetch de precios; acá vive lo testeable: si un precio cruzó
 * el objetivo, y cómo agrupar los símbolos a consultar (un fetch por símbolo).
 */

export type AlertDirection = "above" | "below";

/**
 * ¿El precio cruzó el objetivo en la dirección pedida?
 *   above → el precio subió A o por encima del objetivo (price >= target).
 *   below → el precio bajó A o por debajo del objetivo (price <= target).
 * Precio no válido (≤0, NaN) → false (nunca dispara con datos malos).
 */
export function crossed(direction: AlertDirection, price: number, target: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  return direction === "above" ? price >= target : price <= target;
}

/**
 * Símbolos distintos a consultar (un getMarketPrice por símbolo, no por alerta).
 * Normaliza a MAYÚSCULAS y guarda el asset_type para el fetch. Si el mismo símbolo
 * aparece con tipos distintos, se consulta cada par (symbol, type) una vez.
 */
export function distinctSymbolFetches<T extends { symbol: string; assetType: string }>(
  alerts: T[],
): { symbol: string; assetType: string }[] {
  const seen = new Set<string>();
  const out: { symbol: string; assetType: string }[] = [];
  for (const a of alerts) {
    const symbol = a.symbol.toUpperCase();
    const key = `${symbol}|${a.assetType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ symbol, assetType: a.assetType });
  }
  return out;
}

/** Clave del mapa de precios: símbolo (MAYÚS) + tipo, para no cruzar el mismo ticker de tipos distintos. */
export function priceKey(symbol: string, assetType: string): string {
  return `${symbol.toUpperCase()}|${assetType}`;
}

/**
 * Alertas que DEBEN dispararse: las que tienen precio y cruzaron su objetivo. Una alerta sin
 * precio (símbolo malo / proveedor caído) simplemente no dispara — nunca rompe el barrido.
 * El llamador solo pasa alertas ACTIVAS, así que una one_shot ya disparada (inactiva) no llega
 * acá → no re-dispara.
 */
export function selectTriggeredAlerts<
  T extends { symbol: string; assetType: string; direction: AlertDirection; targetPrice: number },
>(alerts: T[], priceByKey: ReadonlyMap<string, { price: number }>): T[] {
  return alerts.filter((a) => {
    const quote = priceByKey.get(priceKey(a.symbol, a.assetType));
    return quote !== undefined && crossed(a.direction, quote.price, a.targetPrice);
  });
}
