/**
 * Lógica pura de las primas de planes a plazo (sin IO). El servicio
 * (contribution-service) hace los SELECT/INSERT; acá vive lo testeable:
 * qué planes cobrar este mes y hasta qué mes están al día las cuotas.
 */

export type PlanPeriod = { year: number; month: number };

/**
 * Planes a cobrar este mes: los que NO tienen ya una fila de aporte en el periodo.
 * Un mes adelantado (fila pre-creada por advancePremiums) o ya cobrado queda fuera
 * → nunca se recobra. La constraint única (holding_id, period) es el backstop; este
 * filtro lo hace explícito y evita el trabajo (merge/gasto) que el 23505 abortaría igual.
 */
export function selectPlansToCharge<T extends { id: string }>(
  plans: T[],
  chargedHoldingIds: ReadonlySet<string>,
): T[] {
  return plans.filter((p) => !chargedHoldingIds.has(p.id));
}

/** Compara dos periodos año/mes. <0 si a<b, 0 si iguales, >0 si a>b. */
function comparePeriods(a: PlanPeriod, b: PlanPeriod): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

/**
 * Mes hasta el que las cuotas están al día: el periodo MÁS ALTO con aporte
 * registrado, sin pasar el vencimiento (si `maturity` cae antes, se topa ahí).
 * Deriva de las filas existentes de holding_contributions — sin columna nueva.
 * Devuelve null si no hay ningún aporte. `maturity` es ISO YYYY-MM-DD o null.
 */
export function planPaidUntil(periods: PlanPeriod[], maturity: string | null): PlanPeriod | null {
  if (periods.length === 0) return null;
  let max = periods[0]!;
  for (const p of periods) {
    if (comparePeriods(p, max) > 0) max = p;
  }
  if (maturity) {
    const m = /^(\d{4})-(\d{2})/.exec(maturity);
    if (m) {
      const cap: PlanPeriod = { year: Number(m[1]), month: Number(m[2]) };
      if (comparePeriods(max, cap) > 0) return cap; // no pasa el vencimiento
    }
  }
  return max;
}
