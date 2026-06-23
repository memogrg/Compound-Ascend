/**
 * Saco de Liquidez ("Tu Liquidez") — motor puro, sin IO. La fuente de verdad es
 * el ledger de movimientos reales: el saldo es SUM(delta). No se recalcula desde
 * el presupuesto (eso es plan, no dinero real).
 */

export type LiquidityRow = { delta: number; reason: string; occurredOn: string };

/** Redondea a 2 decimales evitando ruido de coma flotante. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
