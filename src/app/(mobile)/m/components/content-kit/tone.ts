import { formatCompact, formatMoney } from "@/lib/format";

/**
 * Tono semántico del kit de contenido. Es PRESENTACIÓN: quién decide el tono es la
 * pantalla (p. ej. % de ejecución de un frasco); aquí solo se traduce a las clases y
 * colores que ya existen en mobile.css.
 */
export type MTone = "neutral" | "success" | "warning" | "danger";

/** Clase de chip/badge por tono (reutiliza .badge neutral/up/down + .badge.mid). */
export const TONE_BADGE: Record<MTone, string> = {
  neutral: "badge neutral",
  success: "badge up",
  warning: "badge mid",
  danger: "badge down",
};

/** Clase de color de texto por tono (vacía en neutral: hereda el color del contexto). */
export const TONE_TEXT: Record<MTone, string> = {
  neutral: "",
  success: "pos",
  warning: "warn",
  danger: "neg",
};

/** Color de relleno por tono (barras, tiles): valor CSS listo para un style inline. */
export const TONE_FILL: Record<MTone, string> = {
  neutral: "var(--text-dim)",
  success: "var(--accent)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};

/**
 * Importe para espacios estrechos (tarjetas de métrica, valores de fila): el número
 * exacto mientras quepa, abreviado (₡347,9 M) cuando se pasa de `maxChars`. Una sola
 * regla para toda la app en vez de decidir formatMoney/formatCompact caso por caso.
 * Los números grandes (hero de resumen) usan formatMoney directo: .m-sum-v es fluido.
 *
 * OJO: decide POR IMPORTE. Para una lista o una tarjeta con varios importes usa
 * mAmountScale — si no, la columna mezcla "₡18,2 M" con "₡4.540.188" y deja de poder
 * escanearse (era el caso de Deudas).
 */
export function mAmount(amount: number, currency: string, maxChars = 9): string {
  const full = formatMoney(amount, currency);
  return full.length > maxChars ? formatCompact(amount, currency) : full;
}

/**
 * Formateador COMPARTIDO por un grupo de importes: mira todos, y si alguno no cabe
 * en `maxChars`, abrevia TODOS. Devuelve la función a aplicar a cada valor.
 *
 * La unidad de decisión es la lista (o la tarjeta), no la celda: dentro de una misma
 * columna todos los valores deben tener el mismo tratamiento para poder compararlos
 * de un vistazo. Úsalo también cuando el número grande de una tarjeta y los importes
 * de su subtexto deban ir a la par.
 */
export function mAmountScale(
  amounts: number[],
  currency: string,
  maxChars = 9,
): (amount: number) => string {
  const anyTooLong = amounts.some((a) => formatMoney(a, currency).length > maxChars);
  return anyTooLong
    ? (a: number) => formatCompact(a, currency)
    : (a: number) => formatMoney(a, currency);
}
