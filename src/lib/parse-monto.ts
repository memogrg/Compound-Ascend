/**
 * Lectura de un monto ESCRITO A MANO. Compartido por web y móvil.
 *
 * En Costa Rica —y en casi toda América Latina y Europa— el separador decimal es la
 * COMA. Los campos la borraban antes de leer el número: escribir «1500,50» guardaba
 * 150050, cien veces de más, sin ningún aviso. El error no se ve al escribirlo; se ve
 * después, en el saldo.
 *
 * La regla, en orden:
 *
 *  1. **Dos separadores distintos** → el ÚLTIMO es el decimal, el otro es de miles.
 *     «1.500,50» y «1,500.50» son 1500.5.
 *  2. **Un separador repetido, con agrupación válida** (grupos de exactamente 3 dígitos)
 *     → todos son de miles. «1.500.000» es 1500000.
 *  3. **Un separador, una sola vez** → decide cuántos dígitos deja detrás:
 *       · parte entera 0    → decimal   («0,125» es 0.125, no 125)
 *       · 1 o 2 dígitos     → decimal   («2,5» · «1500,50»)
 *       · exactamente 3     → MILES     («1.500» es 1500, «12.345» es 12345)
 *       · 4 o más           → decimal   («12,3456»)
 *
 * El caso de los 3 dígitos es el que obliga a mirar la longitud: «1.500» tecleado casi
 * siempre significa mil quinientos, no uno con medio. La excepción de la parte entera en
 * cero existe porque «0,125» sí es una fracción — nadie escribe cero mil ciento
 * veinticinco.
 *
 * Una agrupación inválida («1..2») no es de miles: cae al caso 1 y el último separador
 * manda. Es entrada a medio escribir, no un número con separadores de millar.
 *
 * Antes de todo eso se limpian el signo, los paréntesis contables, el espacio de miles y
 * los símbolos (₡, $, US$, USD, CRC…): lo que no sea dígito o separador se descarta.
 *
 * NO confundir con `montoDeCelda` (financial-base/engine/csv-parse), que lee montos de un
 * ARCHIVO. Hoy son dos implementaciones distintas; unificarlas está pendiente de decisión
 * y hay que hacerlo con tests de caracterización, porque `src/lib/ai/` tiene además tres
 * lectores propios con umbrales que no coinciden entre sí.
 */

/** Lo único que puede formar parte de un número: dígitos y separadores. */
const SOLO_NUMERICO = /[^0-9.,]/g;

/** Paréntesis con dígitos adentro: notación contable de negativo, «(1.234,56)». */
const PARENTESIS_CONTABLE = /\(\s*[^()]*\d[^()]*\)/;

/** El último separador es el decimal; todos los demás, de miles. */
function decimalEnElUltimo(s: string): string {
  const i = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const entero = s.slice(0, i).replace(/[.,]/g, "");
  const decimales = s.slice(i + 1).replace(/[.,]/g, "");
  return `${entero}.${decimales}`;
}

/** Aplica la regla de arriba a una cadena que ya solo tiene dígitos y separadores. */
function interpretarSeparadores(s: string): string {
  const comas = (s.match(/,/g) ?? []).length;
  const puntos = (s.match(/\./g) ?? []).length;
  if (comas + puntos === 0) return s;

  // 1. Dos tipos distintos: no hay ambigüedad, el último es el decimal.
  if (comas > 0 && puntos > 0) return decimalEnElUltimo(s);

  const partes = s.split(comas > 0 ? "," : ".");

  // 2. Repetido: solo es de miles si agrupa de a 3. «1..2» no agrupa nada.
  if (comas + puntos > 1) {
    const agrupaDeATres = partes.slice(1).every((p) => p.length === 3);
    return agrupaDeATres ? partes.join("") : decimalEnElUltimo(s);
  }

  // 3. Una sola vez: manda cuántos dígitos quedaron detrás.
  const entero = partes[0] ?? "";
  const cola = partes[1] ?? "";
  const enteroEsCero = entero === "" || Number(entero) === 0;
  const esDeMiles = !enteroEsCero && cola.length === 3;
  return esDeMiles ? entero + cola : `${entero}.${cola}`;
}

/**
 * De lo que la persona escribió a una cadena que `Number` entiende.
 * Devuelve `""` si no quedó ningún dígito.
 */
export function normalizarMontoTexto(input: string): string {
  const negativo = input.includes("-") || PARENTESIS_CONTABLE.test(input);
  const limpio = input.replace(SOLO_NUMERICO, "");
  if (!/\d/.test(limpio)) return "";
  const cuerpo = interpretarSeparadores(limpio);
  return negativo ? `-${cuerpo}` : cuerpo;
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
