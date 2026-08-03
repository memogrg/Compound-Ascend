/**
 * Sugerencia de "lo recibido" al registrar un ingreso a una fuente — motor puro.
 *
 * Regla de producto: SIEMPRE se puede registrar lo recibido, aunque la fuente ya
 * llegue al 100 % de lo proyectado o lo supere (lo real puede exceder al plan; el
 * 100 % es plan, no tope). Por eso la sugerencia nunca es 0: al 100 %+ propone el
 * monto pleno de la fuente, para registrar un extra de un toque.
 */

/** Fracción sugerida en fuentes recurrentes sub-mensuales (igual que la web). */
export const RECURRENT_FRACTION: Record<string, number> = { semanal: 0.25, quincenal: 0.5 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monto sugerido: fracción recurrente, o el restante del mes; nunca 0 (a 100 %+ el monto pleno). */
export function suggestedReceipt(
  source: { amount: number; frequency: string; recurringItemId?: string | null },
  received: number,
): number {
  const frac = source.recurringItemId ? RECURRENT_FRACTION[source.frequency] : undefined;
  if (frac) return round2(source.amount * frac);
  const remaining = round2(source.amount - received);
  return remaining > 0 ? remaining : source.amount;
}
