/**
 * Saco de Liquidez ("Tu Liquidez") — motor puro, sin IO. La fuente de verdad es
 * el ledger de movimientos reales: el saldo es SUM(delta). No se recalcula desde
 * el presupuesto (eso es plan, no dinero real).
 */
import { convertCurrency } from "@/lib/fx";

export type LiquidityRow = { delta: number; reason: string; occurredOn: string };

/** Redondea a 2 decimales evitando ruido de coma flotante. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Liquidez "al cierre" de un periodo (saldo hasta `to`, inclusive), normalizando
 * cada delta a la moneda de display. Puro: el servicio pasa TODAS las filas del
 * ledger y esta función decide cuáles cuentan.
 *
 * Regla clave: la fila de **apertura** es la BASE del saldo y cuenta SIEMPRE, sin
 * importar su fecha — el saldo inicial se fija con `occurred_on = hoy`, así que
 * filtrarlo por fecha borraría la base al cerrar un mes pasado (saldo roto). El
 * resto (`transaccion`/`ajuste`) sólo cuenta si ocurrió en/antes de `to`.
 */
export function sumClosingBalance(
  rows: { delta: number | string; currency: string; reason: string; occurredOn: string }[],
  to: string,
  displayCurrency: string,
  rates: Record<string, number>,
): number {
  return round2(
    rows.reduce((acc, r) => {
      const included = r.reason === "apertura" || r.occurredOn <= to;
      return included
        ? acc + convertCurrency(Number(r.delta), r.currency, displayCurrency, rates)
        : acc;
    }, 0),
  );
}

/**
 * Regla de signo del cash para UN evento de dinero — el único lugar donde vive
 * la tabla de verdad de la liquidez. La aplica `recordTransactionDelta` (camino
 * normal) y la replica la RPC atómica del pago de deuda en SQL:
 *
 *   ingreso                         → +amount   (salario, retiro de meta, venta,
 *                                                dividendo/renta)
 *   gasto                           → −amount   (gasto normal, aporte a meta,
 *                                                compra, prima, pago de deuda)
 *   gasto OFF-BUDGET (frasco)       →  0        (consumir un frasco de meta:
 *                                                countsInBudget=false; el cash ya
 *                                                salió al APORTAR, restar otra vez
 *                                                lo descuadraría → NEUTRO)
 *   transferencia / ajuste / otro   →  0        (no mueve el cash)
 */
export function liquidityDelta(args: {
  kind: string;
  amount: number;
  countsInBudget?: boolean;
}): number {
  // Consumo de un frasco de meta: gasto off-budget → neutro (el aporte ya restó).
  if (args.kind === "gasto" && args.countsInBudget === false) return 0;
  if (args.kind === "ingreso") return round2(args.amount);
  if (args.kind === "gasto") return round2(-args.amount);
  return 0;
}

/** Saldo actual = suma de todos los deltas del ledger. */
export function computeLiquidityBalance(rows: LiquidityRow[]): number {
  return round2(rows.reduce((acc, r) => acc + r.delta, 0));
}

/**
 * Cambio neto del periodo (suma de deltas cuyo occurredOn cae en el mes dado).
 * Para el checkpoint/ritual e histórico; NO muta el saldo.
 */
export function periodNetChange(
  rows: LiquidityRow[],
  period: { year: number; month: number },
): number {
  const sum = rows.reduce((acc, r) => {
    const d = new Date(`${r.occurredOn}T00:00:00`);
    if (Number.isNaN(d.getTime())) return acc;
    return d.getFullYear() === period.year && d.getMonth() + 1 === period.month
      ? acc + r.delta
      : acc;
  }, 0);
  return round2(sum);
}
