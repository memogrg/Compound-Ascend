/**
 * PARSEO DE UN BLOQUE DE ESTADO DE CUENTA pegado en el chat.
 *
 * Puro y determinista: el LLM no toca los montos ni las fechas. Un estado de cuenta es la fuente
 * de verdad del banco — si el modelo "interpreta" 3,900.00 como 3.900 o corre una fecha un día,
 * el usuario termina registrando plata que no gastó. El fallback al LLM (si algún día hace falta
 * para un formato raro) va en el caller, nunca acá.
 *
 * Formato objetivo:  `246276  2026-07-17  SUBWAY LAGUNILLA  3,900.00  COL  D`
 * Tolera: sin referencia, fechas DD/MM/AAAA, montos 1.234,56 o 1,234.56, y D/C o DEB/CRE.
 */

/** Una fila del estado, ya normalizada. */
export type StatementRow = {
  /** Referencia del banco, si venía. Solo informativa: no se usa para conciliar. */
  ref: string | null;
  /** YYYY-MM-DD. */
  fecha: string;
  comercio: string;
  monto: number;
  /** ISO-4217 ya normalizada (COL → CRC). */
  moneda: string;
  /** D (débito) = gasto; C (crédito) = ingreso. */
  tipo: "gasto" | "ingreso";
};

/**
 * COL es la grafía del estado de cuenta local para colones; el ISO real es CRC. Traducirla acá y
 * no más abajo evita que una fila entre al sistema con una moneda que no existe.
 */
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
  "€": "EUR",
};

const FECHA = String.raw`(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})`;
const MONTO = String.raw`(-?[\d]{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)`;
const MONEDA = String.raw`(COL(?:ONES)?|CRC|USD|DOL(?:ARES)?|EUR|₡|\$|€)`;
const TIPO = String.raw`(D|C|DB|CR|DEB|CRE|DEBITO|CREDITO|D[ÉE]BITO|CR[ÉE]DITO)`;

/**
 * Una fila: referencia opcional, fecha, comercio, monto, moneda opcional, tipo opcional.
 * El comercio es no-goloso para que el monto se lo lleve el número de la DERECHA (una fila puede
 * traer más de un número: la referencia ya salió, pero el comercio puede tener dígitos).
 */
const FILA = new RegExp(
  String.raw`^\s*(?:(\d{4,})\s+)?${FECHA}\s+(.+?)\s+${MONTO}\s*${MONEDA}?\s*${TIPO}?\s*$`,
  "i",
);

/** Normaliza separadores de miles/decimales: el ÚLTIMO separador manda si deja 1-2 decimales. */
export function parseMonto(raw: string): number | null {
  let s = raw.replace(/\s/g, "");
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const iPunto = s.lastIndexOf(".");
  const iComa = s.lastIndexOf(",");
  const iDec = Math.max(iPunto, iComa);
  if (iDec >= 0) {
    const decimales = s.length - iDec - 1;
    if (decimales >= 1 && decimales <= 2) {
      // Ese último separador ES el decimal; todo lo demás son miles.
      const entero = s.slice(0, iDec).replace(/[.,]/g, "");
      s = `${entero}.${s.slice(iDec + 1)}`;
    } else {
      s = s.replace(/[.,]/g, ""); // "3.900" / "1,234" → miles, sin decimales
    }
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n);
}

/** Fecha del estado → YYYY-MM-DD. Día/mes ambiguos se resuelven como DD/MM (formato local). */
export function parseFecha(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${pad(iso[2]!)}-${pad(iso[3]!)}`;
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!dmy) return null;
  const [, d, m, y] = dmy;
  const anio = y!.length === 2 ? `20${y}` : y!;
  const dd = Number(d);
  const mm = Number(m);
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return null;
  return `${anio}-${pad(m!)}-${pad(d!)}`;
}

const pad = (v: string): string => v.padStart(2, "0");

/** D/débito = salida de plata = gasto. Sin marca, se asume gasto (un estado es casi todo débito). */
function parseTipo(raw: string | undefined): "gasto" | "ingreso" {
  if (!raw) return "gasto";
  return /^c/i.test(raw) ? "ingreso" : "gasto";
}

/** Limpia el comercio: espacios colapsados y sin separadores de columna sobrantes. */
function limpiarComercio(raw: string): string {
  return raw.replace(/[|\t]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parsea el bloque. Devuelve SOLO las filas que se entendieron completas; las que no, se cuentan
 * aparte para poder decírselo al usuario en vez de tragárselas en silencio (una fila perdida es
 * un gasto que va a aparecer como "faltante" y se registraría dos veces).
 */
export function parseStatement(text: string): { filas: StatementRow[]; ignoradas: string[] } {
  const filas: StatementRow[] = [];
  const ignoradas: string[] = [];
  for (const linea of text.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l) continue;
    const m = FILA.exec(l);
    if (!m) {
      // Solo se reporta como ignorada si PARECÍA una fila (trae fecha o monto); los encabezados
      // y el texto que el usuario escriba alrededor del bloque no son errores.
      if (new RegExp(FECHA).test(l) && /\d/.test(l)) ignoradas.push(l);
      continue;
    }
    const [, ref, fechaRaw, comercioRaw, montoRaw, monedaRaw, tipoRaw] = m;
    const fecha = parseFecha(fechaRaw!);
    const monto = parseMonto(montoRaw!);
    const comercio = limpiarComercio(comercioRaw ?? "");
    if (!fecha || monto === null || !comercio) {
      ignoradas.push(l);
      continue;
    }
    filas.push({
      ref: ref ?? null,
      fecha,
      comercio,
      monto,
      moneda: MONEDAS[(monedaRaw ?? "").toUpperCase()] ?? "CRC",
      tipo: parseTipo(tipoRaw),
    });
  }
  return { filas, ignoradas };
}

/** Mínimo de filas para considerar que el usuario PEGÓ un estado y no escribió una frase. */
export const MIN_FILAS_BLOQUE = 2;

/**
 * ¿El mensaje es un BLOQUE de transacciones pegado?
 *
 * Se exige que la mayoría de las líneas con contenido parseen como fila, no solo que haya dos:
 * un mensaje normal que mencione dos fechas y dos montos ("gasté 3.900 el 17/07 y 5.000 el 18/07")
 * no es un estado de cuenta, y tratarlo como tal secuestraría una conversación.
 */
export function pareceBloqueDeEstado(text: string): boolean {
  const lineas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length < MIN_FILAS_BLOQUE) return false;
  const { filas } = parseStatement(text);
  if (filas.length < MIN_FILAS_BLOQUE) return false;
  return filas.length >= Math.ceil(lineas.length * 0.6);
}
