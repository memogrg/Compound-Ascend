/** Formateo de moneda y porcentajes en español (es-CR por defecto). */
import { SUPPORTED_CURRENCIES } from "@/lib/fx";

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

/** Símbolo de una moneda para la UI (fallback al propio código si no se conoce). */
export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOL[code] ?? code;
}

export type CurrencyOption = { code: string; symbol: string };

/**
 * Fuente ÚNICA de la lista de monedas para selectores de UI: derivada de
 * SUPPORTED_CURRENCIES (fx) + CURRENCY_SYMBOL. Todo `<select>` de moneda debe
 * consumir esta lista en vez de redeclarar su propio set.
 */
export const CURRENCY_OPTIONS: readonly CurrencyOption[] = SUPPORTED_CURRENCIES.map((code) => ({
  code,
  symbol: currencySymbol(code),
}));

/**
 * Moneda por defecto al capturar un monto. Prioridad: la del ítem en edición →
 * la detectada (recibo/compra) → la PRINCIPAL del usuario. NUNCA la de
 * visualización del topbar: esa solo afecta cómo se muestran los agregados.
 * Centraliza la regla para que los formularios no la reimplementen mal.
 */
export function captureCurrencyDefault(
  itemCurrency: string | null | undefined,
  prefillCurrency: string | null | undefined,
  primaryCurrency: string,
): string {
  return itemCurrency ?? prefillCurrency ?? primaryCurrency;
}

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
  const n = new Intl.NumberFormat("es-CR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
  return `${sym}${n}`;
}
