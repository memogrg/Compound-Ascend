/**
 * Moneda en la que se MUESTRA una posición del portafolio.
 *
 * Los activos COTIZADOS en mercado (etf/accion/cripto) tienen precio del feed, que los cotiza en
 * USD → su fila se muestra en USD, no en la moneda que el usuario registró (BTC en ₡ no tiene
 * sentido: cotiza en dólares). Los NO cotizados (inmueble, negocio, plan a plazo, valor manual) se
 * muestran en su moneda registrada. Los AGREGADOS del portafolio siguen en la moneda de
 * visualización (con la nota "convertido a X") — esto solo afecta la fila individual.
 *
 * Puro y client-safe (lo consumen los componentes de la tabla web y móvil).
 */

const QUOTED_ASSET_TYPES = new Set(["etf", "accion", "cripto"]);

/** Moneda de cotización del feed para los activos cotizados (todos los proveedores devuelven USD). */
export const QUOTE_CURRENCY = "USD";

/** ¿Este activo cotiza en mercado (tiene precio de feed)? */
export function isQuotedAsset(assetType: string | null | undefined): boolean {
  return !!assetType && QUOTED_ASSET_TYPES.has(assetType);
}

/**
 * Moneda para MOSTRAR una posición: USD si cotiza en mercado; si no, la moneda registrada.
 */
export function holdingDisplayCurrency(
  assetType: string | null | undefined,
  registeredCurrency: string,
): string {
  return isQuotedAsset(assetType) ? QUOTE_CURRENCY : registeredCurrency;
}
