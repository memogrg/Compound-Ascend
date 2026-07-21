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
