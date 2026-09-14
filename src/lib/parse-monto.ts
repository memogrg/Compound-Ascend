/**
 * Lectura de un monto ESCRITO A MANO. Compartido por web y móvil.
 *
 * En Costa Rica —y en casi toda América Latina y Europa— el separador decimal es la
 * COMA. Los campos la borraban antes de leer el número: escribir «1500,50» guardaba
 * 150050, cien veces de más, sin ningún aviso. El error no se ve al escribirlo; se ve
 * después, en el saldo.
 *
 * La regla es una sola y resuelve los tres formatos a la vez: **el ÚLTIMO separador es el
 * decimal**, y cualquier otro es de miles y se descarta.
 *
 *   "1500,50"   → 1500.5   (coma decimal)
 *   "1.500,50"  → 1500.5   (punto de miles, coma decimal)
 *   "1,500.50"  → 1500.5   (coma de miles, punto decimal)
 *
 * No hace falta saber la configuración regional del dispositivo: la posición del último
 * separador ya lo dice. Un separador suelto al final («1500,») se acepta mientras se
 * escribe, porque si no el campo se pelearía con el dedo.
 *
 * NO confundir con `montoDeCelda` (financial-base/engine/csv-parse): ése lee montos de un
 * ARCHIVO y usa una regla distinta a propósito — quien teclea «1.500» quiere 1,5, pero un
 * banco que exporta «1.500» quiere mil quinientos.
 */

/** Deja solo lo que puede formar parte de un número: dígitos y separadores. */
const SOLO_NUMERICO = /[^0-9.,]/g;

/**
 * De lo que la persona escribió a una cadena que `Number` entiende.
 * Devuelve `""` si no quedó nada aprovechable.
 */
export function normalizarMontoTexto(input: string): string {
  const limpio = input.replace(SOLO_NUMERICO, "");
  if (limpio === "") return "";

  const ultimoSeparador = Math.max(limpio.lastIndexOf(","), limpio.lastIndexOf("."));
  if (ultimoSeparador === -1) return limpio;

  // Todo lo anterior al último separador pierde sus separadores (son de miles); el
  // último se vuelve punto, que es lo único que `Number` acepta.
  const entero = limpio.slice(0, ultimoSeparador).replace(/[.,]/g, "");
  const decimales = limpio.slice(ultimoSeparador + 1).replace(/[.,]/g, "");
  return `${entero}.${decimales}`;
}

/**
 * El monto como número, o `undefined` si el texto todavía no es uno.
 *
 * `undefined` y no 0: un campo vacío no es «cero colones», y confundirlos hace que un
 * formulario a medio llenar parezca completo.
 */
export function parseMonto(input: string): number | undefined {
  const normalizado = normalizarMontoTexto(input);
  if (normalizado === "") return undefined;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : undefined;
}
