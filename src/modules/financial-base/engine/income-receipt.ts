/**
 * Sugerencia de "lo recibido" al registrar un ingreso a una fuente — motor puro.
 *
 * Regla de producto: SIEMPRE se puede registrar lo recibido, aunque la fuente ya
 * llegue al 100 % de lo proyectado o lo supere (lo real puede exceder al plan; el
 * 100 % es plan, no tope). Por eso la sugerencia nunca es 0: al 100 %+ propone el
 * monto pleno de la fuente, para registrar un extra de un toque.
 *
 * El monto de la fuente es SIEMPRE lo que se recibe POR PAGO (ver `monthlyize`),
 * así que la sugerencia se deriva de ahí sin fracciones inventadas. La vieja
 * RECURRENT_FRACTION (quincenal → ×0.5) asumía lo contrario — que el monto era
 * mensual — y sugería la mitad de la quincena; se eliminó.
 */
import { esSubMensual, type Frequency } from "./monthlyize";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Monto sugerido para el próximo "Recibido".
 *
 * - Sub-mensual (diario/semanal/quincenal): cada clic es UN pago, así que se
 *   sugiere el pago PLENO. Una quincena de ₡800.000 sugiere ₡800.000, y dos
 *   clics en el mes suman los ₡1.600.000 planificados.
 * - Mensual y multi-mes: el pago llega una sola vez en su mes, así que se
 *   sugiere lo que falta de ese pago; nunca 0 (a 100 %+, el monto pleno).
 */
export function suggestedReceipt(
  source: { amount: number; frequency: string; recurringItemId?: string | null },
  received: number,
): number {
  if (esSubMensual(source.frequency as Frequency)) return round2(source.amount);
  const remaining = round2(source.amount - received);
  return remaining > 0 ? remaining : source.amount;
}
