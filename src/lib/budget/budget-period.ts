/**
 * ¿De qué mes leer el presupuesto?
 *
 * El presupuesto vive por periodo (`period_month` / `period_year`). Filtrar SIEMPRE por el
 * mes en curso parece obvio, pero rompe el primer día de cada mes y para todo el que
 * presupuesta cada tanto: sin líneas del mes, los sobres suman 0 y el compromiso mensual
 * —y con él el gasto de referencia, los meses de colchón y el número de independencia—
 * se desploma sin avisar. El usuario ve caer su número sin haber cambiado nada.
 *
 * Regla: se usa el mes en curso si tiene presupuesto; si no, el ÚLTIMO mes que lo tenga.
 * Nunca en silencio: `isFallback` viaja hasta la pantalla para que el número diga con qué
 * mes se calculó.
 */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/**
 * Aviso para la pantalla cuando el número NO se calculó con el mes en curso. Devuelve null
 * cuando sí: no hay nada que aclarar y una nota de más es ruido.
 */
export function avisoPresupuesto(p?: { month: number; year: number; isFallback: boolean } | null) {
  if (!p?.isFallback) return null;
  const mes = MESES[p.month - 1] ?? `mes ${p.month}`;
  return `Calculado con tu presupuesto de ${mes}: este mes todavía no tenés uno.`;
}

export type BudgetPeriod = {
  month: number;
  year: number;
  /** true = el mes en curso no tenía presupuesto y este viene de un mes anterior. */
  isFallback: boolean;
};
