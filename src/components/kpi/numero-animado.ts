/**
 * Cómo se le pide a NumberFlow que escriba EXACTAMENTE lo que escribiría `formatMoney`.
 * Puro: sin React.
 *
 * El problema, medido: `format.ts` es determinista y agrupa los miles con punto («₡1.234.567»),
 * mientras que `Intl` con `es-CR` usa **espacio fino** («₡1 234 567») y un guion normal para el
 * negativo («-₡890.000») en vez del signo menos tipográfico («−»). NumberFlow formatea con
 * `Intl`, así que pedirle la moneda directamente daría un número que no coincide con el resto
 * de la app — y un hero que dice algo distinto de la tarjeta de al lado es peor que un hero sin
 * animar.
 *
 * La salida:
 *  - `locales: "de-DE"` porque su agrupación es punto y su decimal es coma, que es justo la
 *    gramática de `format.ts`. No se elige por el idioma —no se muestra ninguna palabra— sino
 *    por su formato numérico.
 *  - el VALOR ABSOLUTO, y el signo dentro del `prefix`. Así el menos es el mismo carácter que
 *    usa `formatMoney` (U+2212) y no el que pondría `Intl`.
 *  - el símbolo de moneda también en el `prefix`, pegado como en el resto de la app.
 *
 * Hay un test que compara carácter a carácter contra `formatMoney` para varios valores,
 * incluidos el 0 y un negativo. Si algún día deja de coincidir, el hero no se anima: se
 * muestra el texto de `formatMoney` tal cual.
 */
import { currencySymbol } from "@/lib/format";

/** El mismo signo menos tipográfico que usa `format.ts`. */
const MENOS = "−";

/**
 * La agrupación de `format.ts` es punto y la decimal, coma. `de-DE` es el locale de `Intl` que
 * coincide exactamente; `es-CR` separa con espacio fino.
 */
export const LOCALE_NUMERICO = "de-DE";

/**
 * Los decimales, y nada más.
 *
 * No es `Intl.NumberFormatOptions` a propósito: el `Format` que acepta NumberFlow es un
 * subconjunto (no admite `notation: "scientific"`, por ejemplo), así que el tipo ancho no
 * le encaja. Declarar solo lo que se usa sirve a los dos lados sin castear nada.
 */
export type FormatoNumero = {
  minimumFractionDigits: number;
  maximumFractionDigits: number;
};

export type PartesNumero = {
  /** Lo que se le pasa a NumberFlow: siempre ≥ 0. */
  valor: number;
  /** Signo y símbolo, ya pegados: «₡» o «−₡». */
  prefijo: string;
  locales: string;
  format: FormatoNumero;
};

/** Decimales por moneda, con la misma regla que `format.ts`: cripto 8, fiat 0. */
function decimalesDe(moneda: string): number {
  return moneda === "BTC" || moneda === "ETH" ? 8 : 0;
}

export function partesNumero(valor: number, moneda: string, decimales?: number): PartesNumero {
  const dec = decimales ?? decimalesDe(moneda);
  // El redondeo manda, igual que en `formatMoney`: −0,4 con 0 decimales es «₡0», no «−₡0».
  const redondeado = Number(Math.abs(valor).toFixed(dec));
  const negativo = redondeado !== 0 && valor < 0;
  return {
    valor: Math.abs(valor),
    prefijo: `${negativo ? MENOS : ""}${currencySymbol(moneda)}`,
    locales: LOCALE_NUMERICO,
    format: { minimumFractionDigits: dec, maximumFractionDigits: dec },
  };
}

/**
 * El texto que producirá NumberFlow con esas partes. Es lo que el test contrasta contra
 * `formatMoney`, y lo que el componente usa como respaldo cuando no anima.
 */
export function textoNumero(partes: PartesNumero): string {
  return partes.prefijo + new Intl.NumberFormat(partes.locales, partes.format).format(partes.valor);
}
