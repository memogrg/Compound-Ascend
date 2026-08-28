/**
 * RED DETERMINISTA sobre las respuestas que afirman TRAYECTORIA (evolución longitudinal).
 *
 * Por qué existe. Igual que `movimientos-guard`: el system-prompt ya prohíbe fabricar historia,
 * pero una instrucción no es garantía — ante "¿cómo vengo?" el modelo inventa una serie de 6
 * meses aunque solo haya 1 punto real (hallazgo Fase 10, mes1). Esto sí lo frena: si la respuesta
 * afirma una trayectoria SIN respaldo en ESTE turno, no sale — se reemplaza por un mensaje honesto
 * que pivotea a los datos actuales.
 *
 * DOS compuertas, según QUÉ se afirma:
 *  - DINERO exacto (serie mes→monto, "de ₡A a ₡B", verbo-de-cambio + ₡ + marco retro): el respaldo
 *    es que `consultar_historial` devolvió ≥2 puntos reales este turno (`conDatos`). Las cifras de
 *    meses pasados SOLO salen de esa herramienta.
 *  - %/MAGNITUD en marco retrospectivo ("35% desde enero"): el respaldo es `ctx.trajectory` definida
 *    (≥3 meses de historia). La dirección/magnitud aproximada vive en el contexto; sin trayectoria,
 *    el % es inventado.
 *
 * PRECISIÓN (el riesgo es el falso positivo en el punto tardío): a mes6 AMBAS compuertas están
 * abiertas (tool ≥2 pts + trajectory definida) → NUNCA bloquea, sigue citando su historia real.
 * Pasan también: dirección sola ("venís subiendo"), % sin marco temporal ("ahorrás 35% del ingreso")
 * y valores ACTUALES sin marco ("tu patrimonio hoy es ₡970.000"). Puro y sin IO: testeable a fondo.
 */

import { near, parseNumberToken } from "@/lib/ai/money-figures";

const MES =
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre";

/** Marco temporal RETROSPECTIVO explícito (pasado), no una recomendación prospectiva. */
const MARCO_RETRO = new RegExp(
  `desde\\s+(?:${MES}|el\\s+inicio|hace\\s+\\d+\\s+mes|que\\s+(?:empez|arranc|us|ten))` +
    `|en\\s+(?:los\\s+)?[uú]ltimos?\\s+\\d+\\s+meses` +
    `|en\\s+estos\\s+(?:[uú]ltimos\\s+)?meses` +
    `|\\bmes\\s+a\\s+mes\\b` +
    `|vs\\.?\\s+(?:el\\s+)?mes\\s+(?:pasado|anterior)`,
  "i",
);

/** Un monto: símbolo de moneda pegado a un dígito (signo opcional intercalado). */
const MONTO = /[₡$€]\s?-?\d/;

/** Verbo de CAMBIO en pasado (subió/creció/mejoró…), no imperativo ni infinitivo prospectivo. */
const VERBO_CAMBIO =
  /(sub[ií][óo]|baj[óo]|creci[óo]|mejor[óo]|empeor[óo]|aument[óo]|reduj[eo]|avanz[óo]|acumul[óo])/i;

/** Serie mes→monto (se exigen ≥2 pares): "enero 2026: ₡720.000 … febrero 2026: ₡590.000". */
const MES_MONTO = new RegExp(`(?:${MES})\\b[^₡$€\\n]{0,20}[₡$€]\\s?-?\\d`, "gi");

/** Transición explícita "de ₡A a ₡B". */
const TRANSICION = /\bde\s+-?[₡$€]\s?[\d.,]+\s+a\s+-?[₡$€]\s?[\d.,]+/i;

/** Un porcentaje. */
const PCT = /\d+(?:[.,]\d+)?\s*%/;

/**
 * ¿La respuesta afirma trayectoria con DINERO exacto? (compuerta = `conDatos` del tool)
 * Serie mes→monto (≥2), o transición "de ₡A a ₡B" en marco retro, o verbo-de-cambio + ₡ + marco retro.
 */
export function afirmaDineroHistorico(reply: string): boolean {
  if ((reply.match(MES_MONTO) ?? []).length >= 2) return true;
  if (TRANSICION.test(reply) && MARCO_RETRO.test(reply)) return true;
  if (VERBO_CAMBIO.test(reply) && MONTO.test(reply) && MARCO_RETRO.test(reply)) return true;
  return false;
}

/** ¿Afirma %/magnitud en marco retrospectivo? (compuerta = `ctx.trajectory` definida) */
export function afirmaMagnitudHistorica(reply: string): boolean {
  return PCT.test(reply) && MARCO_RETRO.test(reply);
}

/** Un token de monto capturado dentro de una afirmación de trayectoria. */
const TOK = "-?[₡$€]\\s?[\\d.,]+";
/** "de ₡A a ₡B" → captura A y B. */
const CAP_TRANSICION = new RegExp(`\\bde\\s+(${TOK})\\s+a\\s+(${TOK})`, "gi");
/** verbo-de-cambio … ₡X (misma cláusula, ≤40 chars) → captura X ("mejoró en ₡250.000"). */
const CAP_CAMBIO = new RegExp(`(?:${VERBO_CAMBIO.source})[^.!?;\\n]{0,40}?(${TOK})`, "gi");
/** serie mes→monto → captura cada monto. */
const CAP_MES_MONTO = new RegExp(`(?:${MES})\\b[^₡$€\\n]{0,20}(${TOK})`, "gi");

/**
 * Las cifras de dinero que forman parte de una AFIRMACIÓN de trayectoria (los extremos de "de A a B",
 * el monto de un verbo-de-cambio, los montos de una serie mes→monto). NO todo monto del reply: un
 * objetivo de meta o el patrimonio de hoy citados al pasar NO son parte del claim histórico, así que
 * no se verifican contra la serie (evita el falso positivo que regresaría conciencia_temporal a mes6).
 */
export function cifrasDeTrayectoria(reply: string): number[] {
  const out: number[] = [];
  const push = (raw: string | undefined) => {
    if (raw === undefined) return;
    const n = parseNumberToken(raw);
    if (n !== null && Math.abs(n) >= 10_000) out.push(Math.round(Math.abs(n)));
  };
  for (const m of reply.matchAll(CAP_TRANSICION)) {
    push(m[1]);
    push(m[2]);
  }
  // CAP_CAMBIO embebe VERBO_CAMBIO (que trae su propio grupo) → el monto es el ÚLTIMO grupo (m[2]).
  for (const m of reply.matchAll(CAP_CAMBIO)) push(m[2]);
  for (const m of reply.matchAll(CAP_MES_MONTO)) push(m[1]);
  return out;
}

/**
 * ¿Toda cifra que la respuesta afirma como TRAYECTORIA está respaldada por la serie REAL del turno?
 * Respaldo = estar a tolerancia de un punto real (|valor|) O de una diferencia entre dos puntos (los
 * "mejoró en ₡X" legítimos son deltas de la serie). Si una cifra del claim no tiene respaldo, el
 * modelo la fabricó aunque haya historial real (≥2 puntos): cierra el hueco "cita cifras inventadas
 * con historial real". Sin cifras específicas de trayectoria → nada que refutar (true).
 */
export function cifrasHistoricasRespaldadas(reply: string, serie: number[]): boolean {
  const cifras = cifrasDeTrayectoria(reply);
  if (cifras.length === 0) return true;
  if (serie.length === 0) return false; // afirma montos de trayectoria sin ninguna serie real
  const respaldos = serie.map((v) => Math.abs(v));
  for (let i = 0; i < serie.length; i++)
    for (let j = i + 1; j < serie.length; j++) respaldos.push(Math.abs(serie[i]! - serie[j]!));
  return cifras.every((f) => respaldos.some((r) => near(f, r)));
}

export type GuardTendencia = { reply: string; bloqueado: boolean };

/** Mensaje de reemplazo: honesto + pivotea a datos actuales (no un rechazo seco). */
export function mensajeSinHistorial(resumenActual?: string): string {
  const base =
    "Todavía no tengo suficiente historial para mostrarte tu evolución mes a mes — recién se va " +
    "armando a medida que usás la app.";
  return resumenActual
    ? `${base} Con tus datos de hoy, ${resumenActual}. En cuanto tengas un par de meses más, te muestro cómo viene cambiando.`
    : `${base} Decime qué querés ver de tu situación de hoy —patrimonio, ahorro, deudas— y te lo doy al toque.`;
}

/**
 * Bloquea si la respuesta afirma una trayectoria SIN respaldo este turno:
 *  - dinero histórico exacto sin `conDatos` (tool devolvió <2 puntos), o
 *  - %/magnitud retrospectivo sin `trajectoryDefined` (usuario nuevo, <3 meses).
 * Con respaldo (mes6: tool ≥2 pts + trajectory definida) la respuesta pasa intacta.
 */
export function guardTendencia(
  reply: string,
  gates: { conDatos: boolean; trajectoryDefined: boolean; serie?: number[] },
  resumenActual?: string,
): GuardTendencia {
  // Dinero histórico: el respaldo NO es solo "existen ≥2 puntos" (conDatos) — es que las cifras que la
  // respuesta afirma como trayectoria COINCIDAN con la serie real. Así un usuario CON historial real
  // que igual inventa las cifras ("de ₡800k a ₡550k" cuando la serie dice otra cosa) también se caza.
  const dineroSinRespaldo =
    afirmaDineroHistorico(reply) &&
    (!gates.conDatos || !cifrasHistoricasRespaldadas(reply, gates.serie ?? []));
  const magnitudSinRespaldo = afirmaMagnitudHistorica(reply) && !gates.trajectoryDefined;
  if (!dineroSinRespaldo && !magnitudSinRespaldo) return { reply, bloqueado: false };
  return { reply: mensajeSinHistorial(resumenActual), bloqueado: true };
}
