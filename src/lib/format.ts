/** Formateo de moneda y porcentajes en español (es-CR por defecto). */
import { SUPPORTED_CURRENCIES, currencyDecimals, isCryptoCurrency } from "@/lib/fx";

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
  BTC: "₿",
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
 * Monedas ofrecidas para DISPLAY/PRINCIPAL (switch del topbar, moneda principal del perfil):
 * fiat solamente. Las cripto (BTC) se CAPTURAN (CURRENCY_OPTIONS) pero no se eligen como
 * moneda en la que se muestran los agregados — evita "todo el patrimonio en ₿0,000…" y no
 * choca con el enum fiat de la moneda principal (account/actions).
 */
export const DISPLAY_CURRENCY_OPTIONS: readonly CurrencyOption[] = CURRENCY_OPTIONS.filter(
  (o) => !isCryptoCurrency(o.code),
);

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

/**
 * POLÍTICA ÚNICA DE FORMATO NUMÉRICO — no la esquives, no la dupliques.
 *
 * 1) MILES CON PUNTO, decimales con coma: ₡1.966.410 · ₡163,3 mil.
 *    La agrupación se hace A MANO, sin Intl/CLDR, y es deliberado: `es-CR` agrupa
 *    distinto según la versión de ICU del motor —Node 20/ICU 78 emite ESPACIO DURO
 *    (U+00A0) y el WebView de iOS emite PUNTO—, así que el MISMO importe salía con
 *    dos separadores según se renderizara en el servidor o en el cliente, a veces
 *    dentro de la misma tarjeta. Delegar la agrupación en CLDR es la causa raíz;
 *    formatear determinista es la cura.
 * 2) NEGATIVOS con el signo DELANTE del símbolo y menos tipográfico: −₡163.300.
 *    "₡-163.300" se lee como un símbolo roto; el signo pertenece al importe entero.
 * 3) CERO NEUTRO: ₡0, sin signo (no es ni positivo ni negativo).
 * 4) LA MONEDA ES OBLIGATORIA. Sin default: un default silencioso a colones es
 *    justo el mecanismo que estampa "₡" sobre un importe en dólares. Una moneda que
 *    no conocemos se rotula con su código ISO (USDT 25), nunca con un símbolo ajeno.
 */

/** Menos tipográfico (U+2212), no el guion ASCII: se alinea con las cifras. */
const MINUS = "−";

/**
 * Agrupa la parte entera de tres en tres con PUNTO. Determinista e idéntico en
 * servidor y dispositivo (ver nota 1 arriba).
 */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Valor absoluto ya formateado: miles con punto, decimales con coma. */
function formatAbs(amount: number, decimals: number): string {
  const [int = "0", dec] = Math.abs(amount).toFixed(decimals).split(".");
  const grouped = groupThousands(int);
  return dec ? `${grouped},${dec}` : grouped;
}

/**
 * Prefijo de moneda. Usa el MISMO mapa que los selectores (CURRENCY_SYMBOL), así
 * que MXN/COP salen como MX$/COL$ y no como un "$" que se confunde con dólares:
 * un símbolo ambiguo incumple la regla de no rotular un importe con una moneda que
 * no le corresponde. Una moneda desconocida se rotula con su código + espacio.
 */
function prefixOf(currency: string): string {
  const sym = CURRENCY_SYMBOL[currency];
  return sym ?? (currency ? `${currency} ` : "");
}

/**
 * Importe con separadores de miles (punto) y 0 decimales por defecto.
 * `currency` es OBLIGATORIO — pasa la moneda DEL IMPORTE, no la de visualización.
 */
export function formatMoney(amount: number, currency: string, decimals?: number): string {
  // Decimales por moneda cuando no se pasan: cripto 8 (satoshis), fiat 0. Un override
  // explícito (p. ej. USD con 2) sigue mandando.
  const dec = decimals ?? currencyDecimals(currency);
  const body = `${prefixOf(currency)}${formatAbs(amount, dec)}`;
  // El redondeo manda: −0,4 con 0 decimales es "₡0", no "−₡0".
  return Number(Math.abs(amount).toFixed(dec)) === 0 || amount >= 0 ? body : `${MINUS}${body}`;
}

/** Formatea una proporción 0-1 como porcentaje entero. */
export function formatPercent(ratio: number, decimals = 0): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** Escalones de abreviación. "mil"/"M" es como se lee en voz alta en es-CR. */
const COMPACT_STEPS: { min: number; div: number; suffix: string }[] = [
  { min: 1e12, div: 1e12, suffix: " B" },
  { min: 1e6, div: 1e6, suffix: " M" },
  { min: 1e4, div: 1e3, suffix: " mil" },
];

/**
 * Versión compacta para cifras grandes: ₡163,3 mil · ₡18,2 M. Misma gramática que
 * formatMoney (punto para miles, coma decimal, signo delante). Por debajo de 10.000
 * no abrevia: "₡9,5 mil" se lee peor que "₡9.500".
 */
export function formatCompact(amount: number, currency: string): string {
  const abs = Math.abs(amount);
  const step = COMPACT_STEPS.find((s) => abs >= s.min);
  if (!step) return formatMoney(amount, currency);
  const scaled = abs / step.div;
  // Un decimal solo si aporta: 163,3 mil pero 50 M (no "50,0 M").
  const dec = Math.round(scaled * 10) % 10 === 0 ? 0 : 1;
  const body = `${prefixOf(currency)}${formatAbs(scaled, dec)}${step.suffix}`;
  return amount < 0 ? `${MINUS}${body}` : body;
}
