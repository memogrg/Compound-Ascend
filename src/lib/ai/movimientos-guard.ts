/**
 * RED DETERMINISTA sobre las respuestas que ENUMERAN MOVIMIENTOS.
 *
 * Por qué existe. El carril determinista se activa por PATRÓN: si la frase del usuario no matchea,
 * la atiende el LLM. Cuando eso pasa en una consulta de transacciones, el modelo no dice "no sé":
 * rellena con comercios y montos plausibles que el usuario nunca gastó. Ya entró por tres puertas
 * distintas (un sustantivo que faltaba en la lista, una cita que apagaba los carriles, una
 * ambigüedad sin salida) y va a volver a entrar por la próxima que falte.
 *
 * El system-prompt ya se lo prohíbe, pero una instrucción no es una garantía. Esto sí: si la
 * respuesta enumera movimientos o afirma un total y en ESE turno no corrió
 * `consultar_transacciones`, la respuesta no sale — se reemplaza por una que pide el dato que
 * falta. Mismo patrón que `applyGuardrail`: determinista, después de generar, sin depender de que
 * el modelo se porte bien.
 *
 * Puro y sin IO: se puede probar exhaustivamente.
 */

/** Fecha en las formas que usa el chat: "3 de julio", "3 jul", "2026-07-03", "03/07". */
const FECHA =
  /(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\b\d{1,2}\s+(?:de\s+)?(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\p{L}*)/iu;

/** Importe con símbolo de moneda: ₡3.900, $20, ₡1.234,56. */
const MONTO = /[₡$€]\s?\d/;

/** Afirmación de un TOTAL de gasto/ingreso ("tus gastos … suman ₡X", "en total gastaste $Y"). */
const AFIRMA_TOTAL =
  /\b(?:suman?|sumaron|total(?:iza|izan)?|gastaste|gast[oó]|llevás|llevas|acumul\p{L}*)\b[^.\n]{0,60}[₡$€]\s?\d/iu;

/**
 * ¿La respuesta ENUMERA movimientos o afirma un total?
 *
 * Se exigen DOS filas con fecha + monto (una sola línea con una fecha y un importe es una frase
 * normal: "el 3 de julio pagaste ₡3.900 de más"), o una afirmación explícita de total.
 */
export function pareceEnumeracionDeMovimientos(reply: string): boolean {
  if (AFIRMA_TOTAL.test(reply)) return true;
  const lineas = reply.split(/\r?\n/);
  const filas = lineas.filter((l) => FECHA.test(l) && MONTO.test(l));
  return filas.length >= 2;
}

/** Lo que se responde cuando se bloquea: honesto y accionable, nunca una tabla inventada. */
export const PEDIDO_DE_DATOS =
  "Necesito consultar tus movimientos para responder eso con datos reales — no quiero darte cifras " +
  "de memoria. Decime el sobre y el periodo (por ejemplo: «los gastos de supermercado del mes " +
  "pasado») y te lo traigo del libro diario.";

export type GuardMovimientos = { reply: string; bloqueado: boolean };

/**
 * Bloquea la respuesta si enumera movimientos sin haber consultado la herramienta.
 *
 * `consultoTool` = si en ESTE turno corrió `consultar_transacciones` (o las otras que devuelven
 * movimientos). Con eso, una respuesta que pasa el `resumen_md` de la tool sale intacta; una que
 * el modelo armó de memoria, no.
 */
export function guardMovimientos(reply: string, consultoTool: boolean): GuardMovimientos {
  if (consultoTool) return { reply, bloqueado: false };
  if (!pareceEnumeracionDeMovimientos(reply)) return { reply, bloqueado: false };
  return { reply: PEDIDO_DE_DATOS, bloqueado: true };
}

/** Herramientas cuya salida SÍ habilita enumerar movimientos y totales. */
export const TOOLS_DE_MOVIMIENTOS = [
  "consultar_transacciones",
  "consultar_historial",
  "consultar_detalle",
];
