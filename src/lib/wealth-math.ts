/**
 * Matemática patrimonial compartida (pura). Fuente ÚNICA de cálculos que dos
 * motores de dominio necesitan por igual, para que no diverjan con dos nombres.
 */

/**
 * Meses de COLCHÓN: cuántos meses cubre el líquido sin ingresos (liquidez / gasto
 * mensual). Lo usan patrimonio-engine y rich-life-engine — antes rich-life lo
 * llamaba `monthsOfIndependence` (el MISMO número con otro nombre). No es
 * "libertad" ni "independencia" patrimonial: es el colchón disponible.
 */
export function mesesDeColchon(liquido: number, gastoMensual: number): number {
  return gastoMensual > 0 ? Math.round((liquido / gastoMensual) * 10) / 10 : 0;
}

/**
 * GASTO DE REFERENCIA mensual — el denominador ÚNICO de todo ratio "contra lo que
 * gasto" (meses de colchón, años de libertad, cobertura pasiva, sensibilidad a la
 * tasa) y la base del número de INDEPENDENCIA.
 *
 * Por qué existe: `monthlyExpenses` viene de la lista base `expense_items`, que es
 * OPCIONAL. Quien presupuesta con sobres, metas y DCA la deja vacía y su gasto real
 * vive en `budget_items` + entidades — o sea, en `monthlyCommitment`. Con la lista
 * vacía el denominador daba 0 y CADA ratio caía a 0 por `safeRatio`: "0 meses de
 * colchón" con el fondo de paz lleno, "0 años de libertad" con el capital invertido,
 * y la bandera "poca liquidez" encendida. No eran cuatro bugs: era este denominador.
 *
 * Regla: manda el compromiso mensual TOTAL (el estilo de vida actual); si no se pudo
 * leer, se cae a la lista base. Es la MISMA precedencia que ya usaba el número de
 * independencia — por eso ahora vive acá, una sola vez, y los ratios no pueden volver
 * a contradecir a los números.
 */
export function gastoDeReferencia(
  monthlyExpenses: number,
  monthlyCommitment?: number | null,
): number {
  return monthlyCommitment != null && monthlyCommitment > 0 ? monthlyCommitment : monthlyExpenses;
}
