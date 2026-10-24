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
 * Esta es la ÚNICA regla del repositorio. Los nueve lectores que existían por separado
 * —formularios, CSV, carril de acciones del chat, guard de tendencia, estados de cuenta,
 * router de intents, correos de BCR/BN/Davivienda/Promerica, correos de BAC y el monto
 * tecleado en un pago vinculado— delegan acá. Cada uno se queda con lo que es suyo: el
 * signo, el rechazo del cero y el tipo que su caller espera (`null`, `NaN` o `undefined`)
 * son validación, no lectura, y viven en el envoltorio.
 *
 * Un emisor con formato fijo se declara con `OpcionesMonto`, nunca con una copia de la
 * regla: una excepción tiene nombre y dueño, o no existe.
 *
 * `tests/unit/parse-monto-caracterizacion.test.ts` fija lo que devuelve cada uno de los
 * nueve ante el mismo corpus. Si tocás esta función, ahí se ve a quién le cambió algo.
 */

/** Lo único que puede formar parte de un número: dígitos y separadores. */
const SOLO_NUMERICO = /[^0-9.,]/g;

/**
 * Separadores pegados al FINAL del número. Son ruido, no decimales: los captura la
 * puntuación de la frase que sigue al monto — «…por CRC 12,444.00, fue aprobada» deja
 * «12,444.00,» cuando el regex del emisor no ancla en dígito. Sin recortarlos, el último
 * separador se leería como el decimal y 12 444 se convertiría en 1 244 400.
 *
 * Solo al final. Al inicio NO: «.5» es medio, y hay avisos que lo escriben así.
 */
const COLGANTE_FINAL = /[.,]+$/;

/** Paréntesis con dígitos adentro: notación contable de negativo, «(1.234,56)». */
const PARENTESIS_CONTABLE = /\(\s*[^()]*\d[^()]*\)/;

/** El último separador es el decimal; todos los demás, de miles. */
function decimalEnElUltimo(s: string): string {
  const i = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const entero = s.slice(0, i).replace(/[.,]/g, "");
  const decimales = s.slice(i + 1).replace(/[.,]/g, "");
  return `${entero}.${decimales}`;
}

/**
 * Opciones de lectura. Existen para EMISORES CONOCIDOS, no para gustos: cada una se
 * justifica con quién manda el texto con ese formato.
 */
export type OpcionesMonto = {
  /**
   * `"en-US"`: la coma es SIEMPRE de miles y el punto SIEMPRE decimal, sin heurística.
   *
   * Lo justifica **BAC**, que emite sus avisos en formato estadounidense («5,000.00»).
   * Con la regla automática, un «1,5» de BAC se leería 1.5 cuando significa 15.
   */
  formato?: "auto" | "en-US";
  /**
   * Cuántos decimales puede tener un monto de esta fuente. Si detrás del último separador
   * quedan MÁS dígitos que eso, ninguno era decimal: todos son de miles. Vale para los
   * tres casos, también para el de dos separadores distintos — «1.500,500» es 1500500,
   * mientras que «1,500.50» y «1.500,50» siguen siendo 1500.5. La parte entera en 0 deja
   * de ser excepción.
   *
   * Lo justifican los avisos de **BCR, BN, Davivienda y Promerica** y los estados de
   * cuenta pegados en el chat, que siempre traen centavos: ahí «12.3456» es 123456 y
   * «0,125» es 125, mientras que en un formulario son 12.3456 y 0.125.
   */
  decimalesMaximos?: number;
};

/** Aplica la regla a una cadena que ya solo tiene dígitos y separadores. */
function interpretarSeparadores(s: string, opciones: OpcionesMonto = {}): string {
  const comas = (s.match(/,/g) ?? []).length;
  const puntos = (s.match(/\./g) ?? []).length;
  if (comas + puntos === 0) return s;

  // Emisor de formato fijo: la coma es de miles y el punto decimal, sin preguntarse nada.
  if (opciones.formato === "en-US") {
    const sinMiles = s.replace(/,/g, "");
    const i = sinMiles.lastIndexOf(".");
    if (i === -1) return sinMiles;
    return `${sinMiles.slice(0, i).replace(/\./g, "")}.${sinMiles.slice(i + 1).replace(/\./g, "")}`;
  }

  // El tope manda sobre los tres caminos: si detrás del último separador quedan más
  // dígitos de los que esa fuente puede tener de decimales, ninguno de los separadores
  // era decimal. Aplicarlo solo al caso de un separador único leería «1.500,500» como
  // 1500.5 cuando un estado de cuenta con centavos lo escribe por 1500500.
  const tope = opciones.decimalesMaximos;
  if (tope !== undefined) {
    const cola = s.slice(Math.max(s.lastIndexOf(","), s.lastIndexOf(".")) + 1);
    if (cola.length > tope) return s.replace(/[.,]/g, "");
  }

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
  // Con tope declarado, haber llegado hasta acá ya significa que la cola cabe en los
  // decimales de la fuente: es decimal, y la parte entera en cero no cambia nada.
  const esDeMiles = tope === undefined && Number(entero) !== 0 && cola.length === 3;
  return esDeMiles ? entero + cola : `${entero}.${cola}`;
}

/**
 * De lo que la persona escribió a una cadena que `Number` entiende.
 * Devuelve `""` si no quedó ningún dígito.
 */
export function normalizarMontoTexto(input: string, opciones: OpcionesMonto = {}): string {
  const negativo = input.includes("-") || PARENTESIS_CONTABLE.test(input);
  const limpio = input.replace(SOLO_NUMERICO, "").replace(COLGANTE_FINAL, "");
  if (!/\d/.test(limpio)) return "";
  const cuerpo = interpretarSeparadores(limpio, opciones);
  return negativo ? `-${cuerpo}` : cuerpo;
}

/**
 * El monto como número, o `undefined` si el texto todavía no es uno.
 *
 * `undefined` y no 0: un campo vacío no es «cero colones», y confundirlos hace que un
 * formulario a medio llenar parezca completo.
 */
export function parseMonto(input: string, opciones: OpcionesMonto = {}): number | undefined {
  const normalizado = normalizarMontoTexto(input, opciones);
  if (normalizado === "") return undefined;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : undefined;
}
