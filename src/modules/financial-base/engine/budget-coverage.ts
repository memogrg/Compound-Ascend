/**
 * Cobertura del presupuesto (piloto Inicio · Delta 1) — motor puro, sin IO.
 *
 * "% en sobres sin presupuesto": qué parte del gasto REAL del periodo cayó en
 * categorías/sobres que NO tienen presupuesto asignado (budget 0 o ausente). Es
 * la señal de las fichas Presupuesto/Gastos: gastar fuera de lo planeado.
 */

/** Fila mínima por categoría: sólo se necesita el monto (ya normalizado). */
export type KeyedValue = Record<string, { value: number }>;

export type BudgetCoverage = {
  /** Gasto real en categorías sin presupuesto (budget ≤ 0). */
  unbudgeted: number;
  /** Gasto real total del periodo (Σ de todas las categorías). */
  total: number;
  /** unbudgeted / total, 0-1. 0 si no hay gasto. */
  pct: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * @param realByKey  gasto real por categoría (p.ej. getRealTotals().expenseByKey)
 * @param budgetByKey presupuesto por categoría (p.ej. getBudgetTotals().expenseByKey)
 */
export function unbudgetedExpenseShare(
  realByKey: KeyedValue,
  budgetByKey: KeyedValue,
): BudgetCoverage {
  let unbudgeted = 0;
  let total = 0;
  for (const [key, { value }] of Object.entries(realByKey)) {
    if (value <= 0) continue;
    total += value;
    // "Sin presupuesto" = la categoría no tiene línea de budget o es ≤ 0.
    const budget = budgetByKey[key]?.value ?? 0;
    if (budget <= 0) unbudgeted += value;
  }
  return {
    unbudgeted: round2(unbudgeted),
    total: round2(total),
    pct: total > 0 ? round2(unbudgeted / total) : 0,
  };
}
