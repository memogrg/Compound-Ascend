import "server-only";

/**
 * EXTRACCIÓN DE UN ESTADO DE CUENTA con LLM, para los formatos que un patrón posicional no puede
 * resolver.
 *
 * POR QUÉ SE INVIERTE LA REGLA. El parseo original era 100 % determinista con el argumento de que
 * el modelo no debe tocar montos ni fechas. Sigue siendo cierto — pero un estado real trae
 * columnas extra (monto Y SALDO), el comercio en la última columna con fecha de posteo y ruido del
 * banco, y fechas mixtas. Ahí el patrón no falla ruidosamente: se queda con el número de la
 * derecha —el saldo— y devuelve una cifra equivocada SIN avisar. Entre un modelo que lee mal una
 * fila que el usuario después revisa en la tarjeta, y una regex que registra el saldo de la cuenta
 * como si fuera un consumo, el riesgo está claramente de un lado.
 *
 * La red sigue puesta: TODO lo que devuelve el modelo se valida acá (fecha real, monto > 0, moneda
 * conocida, tipo válido) y nada se registra sin la confirmación del usuario. La CONCILIACIÓN
 * contra lo ya registrado sigue siendo determinista — el modelo no decide qué está y qué falta.
 *
 * Es un parseo por PEGADO, no un hot-path: la llamada extra es aceptable.
 */
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { parseFecha, parseMonto, type StatementRow } from "@/lib/ai/statement-parse";
import { logger } from "@/lib/logger";

/** Tope de filas que se aceptan del modelo (mismo espíritu que el tope del alta en lote). */
const MAX_FILAS = 80;

const MONEDAS: Record<string, string> = {
  COL: "CRC",
  COLONES: "CRC",
  CRC: "CRC",
  "₡": "CRC",
  USD: "USD",
  DOL: "USD",
  DOLARES: "USD",
  $: "USD",
  EUR: "EUR",
};

const SYSTEM = [
  "Sos un extractor de movimientos de ESTADOS DE CUENTA bancarios. Recibís el texto pegado tal cual",
  "y devolvés SOLO un JSON array, sin texto alrededor y sin ```.",
  "",
  'Cada elemento: {"fecha":"YYYY-MM-DD","comercio":"...","monto":123.45,"moneda":"CRC|USD|EUR","tipo":"gasto|ingreso"}',
  "",
  "REGLAS (en orden de importancia):",
  "1. MONTO = el importe DE LA TRANSACCIÓN, nunca el SALDO/BALANCE de la cuenta. Si la fila trae",
  "   dos o más números grandes, el saldo suele ser el ÚLTIMO y el más grande, y suele variar poco",
  "   entre filas consecutivas mientras el monto cambia. Ante duda, elegí el que NO parece un saldo",
  "   corriente. Nunca inventes un número que no esté en la fila.",
  "2. COMERCIO = el nombre del negocio. Puede venir en la última columna y venir acompañado de una",
  "   FECHA DE POSTEO y de ruido del banco. Quitá: ubicaciones (SAN JOSE, HEREDIA, ESCAZU, CARTAGO,",
  "   ALAJUELA, CRI), códigos de banco o red (CRI/BNCR, BNCR, BAC, VISA, MASTERCARD), y palabras",
  "   genéricas sueltas (TARJETA, COLONES, DOLARES, COMPRA, POS). Dejá el nombre reconocible.",
  '   Ejemplo: "2026-07-19 SUBWAY LAGUNILLA SAN JOSE CRI/BNCR" → comercio "SUBWAY LAGUNILLA".',
  "3. FECHA = la de la TRANSACCIÓN, no la de posteo, cuando se distingan. Acepta YYYY-MM-DD y",
  "   DD/MM/YYYY; devolvé siempre YYYY-MM-DD. Si el año no aparece, usá el que se deduzca del resto",
  "   del bloque.",
  "4. TIPO: D/DEB/DÉBITO/cargo = gasto. C/CRE/CRÉDITO/abono/depósito = ingreso. Sin marca, gasto.",
  "5. MONEDA: COL/COLONES/₡ = CRC. USD/DOL/$ = USD. Sin marca, CRC.",
  "6. Ignorá encabezados, totales, saldos de apertura/cierre y cualquier línea que no sea un",
  "   movimiento. NO inventes filas: si una línea no es un movimiento, omitila.",
].join("\n");

/** Fila cruda tal como puede venir del modelo (todo por validar). */
type Cruda = {
  fecha?: unknown;
  comercio?: unknown;
  monto?: unknown;
  moneda?: unknown;
  tipo?: unknown;
};

/** Extrae el primer array JSON del texto del modelo (tolera ``` y texto alrededor). */
function extraerArray(texto: string): Cruda[] | null {
  const limpio = texto.replace(/```(?:json)?/gi, "").trim();
  const i = limpio.indexOf("[");
  const j = limpio.lastIndexOf("]");
  if (i < 0 || j <= i) return null;
  try {
    const v = JSON.parse(limpio.slice(i, j + 1));
    return Array.isArray(v) ? (v as Cruda[]) : null;
  } catch {
    return null;
  }
}

/**
 * Valida una fila del modelo contra las MISMAS reglas del parser determinista. Lo que no pasa se
 * descarta: el modelo puede alucinar una fila, pero no puede meter una fecha imposible ni un monto
 * negativo en el resultado.
 */
function validar(c: Cruda): StatementRow | null {
  const fechaRaw = typeof c.fecha === "string" ? c.fecha.trim() : "";
  const fecha = parseFecha(fechaRaw);
  if (!fecha) return null;

  const comercio = typeof c.comercio === "string" ? c.comercio.replace(/\s+/g, " ").trim() : "";
  if (!comercio) return null;

  const monto =
    typeof c.monto === "number" && Number.isFinite(c.monto)
      ? Math.abs(c.monto)
      : typeof c.monto === "string"
        ? parseMonto(c.monto)
        : null;
  if (monto === null || monto <= 0) return null;

  const moneda =
    MONEDAS[
      String(c.moneda ?? "")
        .toUpperCase()
        .trim()
    ] ?? "CRC";
  const tipo = String(c.tipo ?? "")
    .toLowerCase()
    .startsWith("ingr")
    ? "ingreso"
    : "gasto";
  return { ref: null, fecha, comercio, monto, moneda, tipo };
}

/**
 * Extrae los movimientos del bloque con el LLM. `null` si no hay proveedor, si la respuesta no
 * trae un array o si no sobrevivió ninguna fila a la validación — el caller decide qué hacer
 * (quedarse con lo determinista, o reportar que no pudo leer).
 */
export async function extraerConLLM(texto: string): Promise<StatementRow[] | null> {
  const provider = createGeminiProvider();
  if (!provider) return null;
  try {
    const res = await provider.chat({
      system: SYSTEM,
      messages: [{ role: "user", content: texto.slice(0, 12_000) }],
      // Holgado: 80 filas de JSON no entran en el default del chat conversacional.
      maxTokens: 4000,
    });
    const crudas = extraerArray(res.text);
    if (!crudas) {
      logger.warn("statement: el modelo no devolvió un array JSON");
      return null;
    }
    const filas = crudas
      .slice(0, MAX_FILAS)
      .map(validar)
      .filter((f): f is StatementRow => f !== null);
    logger.info("statement.extraccion_llm", { crudas: crudas.length, validas: filas.length });
    return filas.length > 0 ? filas : null;
  } catch (err) {
    logger.warn("statement: extracción con LLM falló", {
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}
