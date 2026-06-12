/** Formateo de moneda y porcentajes en español (es-CR por defecto). */

/**
 * Símbolos para selectores/prefijos de moneda en la UI (MX$/COL$ desambiguados).
 * OJO: formatMoney usa su propio mapa interno con "$" plano para MXN/COP —
 * unificarlos cambia output visible; decisión pendiente (ver 02-pendientes-fase3).
 */
export const CURRENCY_SYMBOL: Record<string, string> = {
  CRC: "₡",
  USD: "$",
  EUR: "€",
  MXN: "MX$",
  COP: "COL$",
  GBP: "£",
};

const SYMBOL: Record<string, string> = {
  CRC: "₡",
  USD: "$",
  EUR: "€",
  MXN: "$",
  COP: "$",
  GBP: "£",
};

/** Formatea un monto con separadores de miles y 0 decimales por defecto. */
export function formatMoney(amount: number, currency = "CRC", decimals = 0): string {
  const sym = SYMBOL[currency] ?? "";
  const n = new Intl.NumberFormat("es-CR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return `${sym}${n}`;
}

/** Formatea una proporción 0-1 como porcentaje entero. */
export function formatPercent(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** Versión compacta para cifras grandes (₡1,2M). */
export function formatCompact(amount: number, currency = "CRC"): string {
  const sym = SYMBOL[currency] ?? "";
  const n = new Intl.NumberFormat("es-CR", { notation: "compact", maximumFractionDigits: 1 }).format(
    amount,
  );
  return `${sym}${n}`;
}
