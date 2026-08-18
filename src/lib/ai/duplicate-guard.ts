/**
 * GUARDA ANTI-DUPLICADO del alta de movimientos. Pura y sin "server-only": la decisión de "esto
 * ya parece registrado" se prueba sin BD; el llamador solo aporta las filas del día.
 *
 * POR QUÉ. Las tres puertas de alta (la tarjeta del chat, el recibo escaneado y el lote del estado
 * de cuenta) escriben sin mirar lo que ya hay. Duplicar un gasto no es un error visible: el
 * movimiento aparece dos veces en un listado largo, el sobre queda corto y el usuario cree que
 * gastó de más. Y hay dos formas fáciles de llegar ahí — confirmar dos veces la MISMA propuesta
 * (la tarjeta seguía viva después de registrar), o registrar por chat algo que ya entró por el
 * recibo o por el estado de cuenta.
 *
 * REGLA: no se bloquea, se AVISA. La app informa y guía; la decisión es del usuario. Un duplicado
 * legítimo existe (dos cafés iguales el mismo día en el mismo lugar), así que la salida es una
 * confirmación explícita, nunca un rechazo.
 */

/** Movimiento ya registrado, con lo mínimo para compararlo. */
export type MovimientoRegistrado = {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurredOn: string;
  categoryId: string | null;
  description: string;
};

/** Lo que se está por registrar. */
export type AltaCandidata = {
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurredOn: string;
  categoryId?: string | null;
  description: string;
};

/**
 * Comercio comparable: sin tildes, sin mayúsculas, sin puntuación ni ruido del banco. "SUPER
 * MERCADO S.A." y "Super Mercado SA" son el mismo comercio escrito por dos caminos distintos.
 */
export function normalizarComercio(s: string): string {
  return (
    s
      .normalize("NFD")
      // NFD deja la tilde como marca de combinación aparte; `\p{M}` la borra sin tener que
      // escribir el rango de code points a mano.
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/** Palabras que no distinguen a un comercio de otro: no cuentan para el parecido. */
const RUIDO = new Set(["sa", "srl", "cr", "de", "del", "la", "el", "los", "las", "y", "compra"]);

function tokens(s: string): string[] {
  return normalizarComercio(s)
    .split(" ")
    .filter((w) => w.length > 1 && !RUIDO.has(w));
}

/**
 * ¿Son "el mismo comercio"? Igualdad tras normalizar, uno contenido en el otro (el banco alarga
 * los nombres: "SUBWAY" vs "SUBWAY LAGUNILLA"), o mayoría de palabras en común.
 *
 * Si a alguno de los dos le falta el texto, no se puede opinar: devuelve false y la decisión
 * queda en manos del resto de las señales (monto, fecha, sobre).
 */
export function comercioParecido(a: string, b: string): boolean {
  const na = normalizarComercio(a);
  const nb = normalizarComercio(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const comunes = ta.filter((w) => tb.includes(w)).length;
  return comunes / Math.min(ta.length, tb.length) >= 0.6;
}

/** Los montos se comparan al céntimo: 4100 y 4100.004 son la misma plata. */
function mismoMonto(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * El movimiento ya registrado que este alta estaría duplicando, o null.
 *
 * Exige SIEMPRE: mismo tipo, misma moneda, mismo monto y misma fecha. Sobre eso:
 *  - si los dos traen sobre, tiene que ser el mismo (dos gastos iguales el mismo día en sobres
 *    distintos son dos gastos distintos);
 *  - si el candidato todavía no tiene sobre (lo va a poner la auto-categorización), el sobre no
 *    puede decidir nada y manda el comercio;
 *  - el comercio parecido confirma; con sobres iguales y comercio ilegible (uno de los dos vacío)
 *    alcanza el resto de las señales.
 */
export function buscarDuplicado(
  cand: AltaCandidata,
  existentes: MovimientoRegistrado[],
): MovimientoRegistrado | null {
  for (const e of existentes) {
    if (e.kind !== cand.kind) continue;
    if (e.currency !== cand.currency) continue;
    if (e.occurredOn !== cand.occurredOn) continue;
    if (!mismoMonto(e.amount, cand.amount)) continue;
    const sobreCand = cand.categoryId ?? null;
    if (sobreCand && e.categoryId && sobreCand !== e.categoryId) continue;
    const parecido = comercioParecido(cand.description, e.description);
    const mismoSobre = !!sobreCand && sobreCand === e.categoryId;
    const sinComercio = !normalizarComercio(cand.description) || !normalizarComercio(e.description);
    if (parecido || (mismoSobre && sinComercio)) return e;
  }
  return null;
}

/**
 * El aviso, con la fecha en palabras. Termina en pregunta a propósito: lo que sigue es una
 * confirmación explícita del usuario, no un error del que no se pueda salir.
 */
export function mensajeDuplicado(fechaEnPalabras: string): string {
  return `Esto ya parece registrado el ${fechaEnPalabras} — ¿lo registro igual?`;
}
