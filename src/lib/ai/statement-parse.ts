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

/**
 * ¿El token parece un IMPORTE y no un número cualquiera del texto?
 * Exige separador decimal/de miles, o al menos 4 dígitos. Así "SUBWAY 221" no cuenta como monto
 * y "3,900.00" / "125430.00" / "3900" sí.
 */
function pareceMonto(token: string): boolean {
  if (/[.,]/.test(token)) return true;
  return token.replace(/\D/g, "").length >= 4;
}

/**
 * Cuántos IMPORTES trae la línea, sin contar la referencia inicial ni la fecha.
 *
 * Es el guard contra el fallo SILENCIOSO del fast-path: con columnas extra
 * (`… 3,900.00  125,430.00` = monto y SALDO) la regex parsea sin quejarse y se queda con el
 * número de la derecha — el saldo. Una línea con más de un importe es ambigua por definición y
 * no la puede resolver un patrón posicional.
 */
export function montosEnLinea(linea: string): number {
  let s = linea.trim().replace(/^\d{4,}\s+/, ""); // referencia del banco
  s = s.replace(/\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/g, " "); // fechas
  const tokens = s.match(/-?\d[\d.,]*\d|\d+/g) ?? [];
  return tokens.filter(pareceMonto).length;
}

/**
 * ¿La línea se puede resolver con el fast-path determinista? Necesita parsear Y traer un solo
 * importe. Si no, va al extractor con LLM: es preferible pagar una llamada a registrar el saldo
 * de la cuenta como si fuera un consumo.
 */
export function esFilaLimpia(linea: string): boolean {
  const l = linea.trim();
  if (!l || !FILA.test(l)) return false;
  return montosEnLinea(l) === 1;
}

/** ¿TODO el bloque se puede resolver sin LLM? Solo entonces se salta la llamada. */
export function bloqueEsLimpio(text: string): boolean {
  const lineas = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidatas = lineas.filter((l) => new RegExp(FECHA).test(l));
  if (candidatas.length === 0) return false;
  return candidatas.every(esFilaLimpia);
}

/**
 * ¿El mensaje es una CONFIRMACIÓN para dar de alta lo que faltaba del estado pegado?
 *
 * Existe porque el flujo se rompía justo acá: tras la tabla de conciliación, el usuario escribe
 * "dale, registralas" en vez de tocar la tarjeta. Ese turno no traía bloque, así que no matcheaba
 * ningún carril determinista y lo atendía el LLM — que escribía los `create_transaction` a mano,
 * con montos convertidos e inventados, y encima los dumpeaba como texto crudo.
 *
 * Deliberadamente CORTA y acotada: un "sí" suelto es ambiguo, así que además de matchear acá el
 * resolver exige encontrar un estado pegado en la conversación reciente. Sin eso, escala.
 */
export function pareceConfirmacionDeAlta(text: string): boolean {
  const t = text.trim();
  if (t.length > 60) return false; // una confirmación es corta; un párrafo es otra cosa
  // Una confirmación NO trae datos nuevos. Con esto "registrá un gasto de 5000 en super" y
  // "vender todos los altcoins a 90% de su ATH" vuelven a su carril: traen cifras, así que son
  // una orden nueva, no un "sí" a lo anterior. (Lo cazó la suite: sin esta línea este detector
  // le robaba el turno al alta de gastos y a los datos de mercado.)
  if (/\d/.test(t)) return false;
  if (/[?¿]/.test(t)) return false; // una pregunta no confirma nada
  // Cierre con lookahead `(?!\p{L})` y NO con `\b`: en JS `\b` se define sobre [A-Za-z0-9_], así
  // que una vocal acentuada no es carácter de palabra y `\bs[ií]\b` NUNCA matchea "sí" — la misma
  // trampa que ya está anotada en el router. Acá costó que un "sí" pelado no confirmara nada.
  // `\p{L}*` y NO `\w*`: `\w` tampoco incluye vocales acentuadas, así que `registr\w*` se para
  // antes de la "á" de "registrá" y el lookahead de cierre falla. Con `\p{L}*` la cola del verbo
  // en voseo entra completa.
  const afirma =
    /\b(?:s[ií]|dale|ok(?:ey)?|listo|perfecto|correcto|confirm\p{L}*|proced\p{L}*|adelante)(?!\p{L})/iu;
  const registrar =
    /\b(?:registr\p{L}*|agreg\p{L}*|a[ñn]ad\p{L}*|apunt\p{L}*|met[eé]\p{L}*|carg\p{L}*|dar de alta|alta)(?!\p{L})/iu;
  // Referencia a lo PENDIENTE. Sin "movimientos/gastos" a propósito: esas palabras aparecen en
  // órdenes nuevas ("registrá un gasto en super") y no distinguen confirmar de crear.
  const refPendientes = /\b(?:faltan\p{L}*|falta|todas?|todos?|esas?|esos?|pendientes?)(?!\p{L})/iu;
  // Verbo con clítico: "registralas", "agregalas", "anotalos" — ya traen el objeto pegado.
  const verboConClitico = /\b(?:registr|agreg|a[ñn]ad|apunt|anot|carg)\p{L}*(?:las|los)(?!\p{L})/iu;

  if (verboConClitico.test(t)) return true;
  if (registrar.test(t) && refPendientes.test(t)) return true;
  // Afirmación pelada ("dale", "ok", "sí"): solo si el mensaje es MUY corto, porque ahí no hay
  // lugar para otra intención.
  return afirma.test(t) && t.length <= 20;
}

/**
 * ¿El mensaje pide VERIFICAR/CONCILIAR contra lo registrado?
 *
 * Es la señal que le gana el turno a `consulta_transacciones`. Sin ella, "verificar si estas
 * transacciones del mes pasado ya están registradas" matchea como consulta del mes —trae
 * "transacciones" y un periodo— y la conciliación no se considera nunca, aunque el mensaje
 * citado sea el estado de cuenta.
 *
 * Cubre las dos formas que fallaban por motivos distintos: la que matcheaba consulta (verificar
 * … del mes pasado) y la que no matcheaba nada ni tenía pronombre ("¿están registradas?").
 */
export function pareceIntencionDeConciliar(text: string): boolean {
  const t = text.trim();
  return (
    // "verificá", "conciliá", "chequeá", "revisá si…", "comparar con lo registrado"
    /\b(?:verific|concili|chequ|cotej|compar)\p{L}*(?!\p{L})/iu.test(t) ||
    // "están registradas", "ya están anotadas", "las tengo cargadas"
    /\b(?:est[aá]n|estan|tengo|ten[eé]s|hay)\p{L}*(?:\s+\p{L}+){0,3}\s+(?:registrad|anotad|guardad|cargad|apuntad)\p{L}*(?!\p{L})/iu.test(
      t,
    ) ||
    /\b(?:registrad|anotad|guardad|cargad|apuntad)[ao]s(?!\p{L})/iu.test(t) ||
    // "cuáles faltan", "qué falta", "cuáles me faltan"
    /\b(?:cu[aá]les|qu[eé]|cuant\p{L}*)(?:\s+\p{L}+){0,2}\s+falta\p{L}*(?!\p{L})/iu.test(t) ||
    /\bfaltan(?!\p{L})/iu.test(t) ||
    // "ya las tengo", "ya están"
    /\bya\s+(?:las|los|est[aá]n|estan|est[aá])(?!\p{L})/iu.test(t)
  );
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
  // La detección NO puede depender del parser estricto. Cuando dependía, un formato sucio —el que
  // más necesita ayuda— no se reconocía como estado y se iba al chat normal: el camino de
  // conciliación no llegaba a ejecutarse nunca. Ahora alcanza con que la línea traiga FECHA y un
  // IMPORTE, que es lo que define un movimiento en cualquier formato; quién lo lee (patrón o LLM)
  // se decide después.
  const conDatos = lineas.filter((l) => new RegExp(FECHA).test(l) && montosEnLinea(l) >= 1);
  if (conDatos.length < MIN_FILAS_BLOQUE) return false;
  return conDatos.length >= Math.ceil(lineas.length * 0.6);
}
