/**
 * El presupuesto de gasto MES A MES para el histórico de `/gastos`.
 *
 * Antes la pantalla tenía una sola cifra —la suma del rango— y la pintaba como línea
 * horizontal contra una serie mensual: con «3m» eran tres meses de presupuesto comparados
 * contra el gasto de cada mes suelto. La línea quedaba muy por encima de la serie y parecía
 * holgura donde no la había.
 *
 * Esto es puro: recibe el presupuesto de `budget_items` de cada mes (que `getRealHistory` ya
 * trae por bucket) y el fallback de aportes de ese mismo mes, y los suma.
 */

export type MesPresupuestado = {
  /** Rótulo del mes, tal cual lo trae la serie histórica. */
  label: string;
  /** `budget_items` de ESE mes, ya en la moneda de visualización. */
  deItems: number;
  /** Aportes de holdings y rentas que no viven en `budget_items`, de ESE mes. */
  fallback: number;
  /** Lo que se pinta: la suma de los dos. */
  total: number;
};

/**
 * Compone la serie mensual.
 *
 * `fallbackPorMes` va indexado igual que `historia`. Un hueco cuenta como 0 y no como
 * «repetir el del mes anterior»: inventar un aporte donde no se pudo leer ninguno es
 * exactamente el error que esta serie viene a corregir.
 */
export function presupuestoPorMes(
  historia: readonly { label: string; budgetExpense: number }[],
  fallbackPorMes: readonly number[],
): MesPresupuestado[] {
  return historia.map((h, i) => {
    const deItems = Number.isFinite(h.budgetExpense) ? h.budgetExpense : 0;
    const bruto = fallbackPorMes[i];
    const fallback = Number.isFinite(bruto) ? (bruto as number) : 0;
    return { label: h.label, deItems, fallback, total: deItems + fallback };
  });
}

/**
 * El total del rango: la suma de los meses.
 *
 * Se deriva de la serie a propósito. Calcularlo aparte es garantizar que un día el titular
 * y el gráfico digan cosas distintas — que es el defecto que se está arreglando.
 */
export function totalDelRango(meses: readonly MesPresupuestado[]): number {
  return meses.reduce((s, m) => s + m.total, 0);
}

/**
 * Cómo se nombra el rango en un rótulo de KPI: «del mes», «de 3 meses», «del año»…
 *
 * El número que muestran esas tarjetas es un total del RANGO, no del mes. Sin decirlo, quien
 * mira compara un trimestre contra su presupuesto mensual y cree que va sobrado.
 */
export function rotuloDelRango(range: string, meses: number): string {
  if (range === "1m" || meses <= 1) return "del mes";
  if (range === "ytd") return "del año";
  if (range === "all") return meses > 0 ? `de ${meses} meses` : "de todo el historial";
  return `de ${meses} meses`;
}
