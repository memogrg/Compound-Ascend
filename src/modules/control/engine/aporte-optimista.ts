/**
 * Cuánto se puede anticipar en la barra al registrar un movimiento — motor puro.
 *
 * El update optimista sólo vale si el número que pintamos es EXACTAMENTE el que
 * va a devolver el servidor. Si no, la barra salta y se corrige a la vista, que
 * es peor que esperar. Esta función es el guardia de esa regla.
 *
 * METAS: un aporte suma su monto al acumulado, sin splits — pero el modal deja
 * cambiar la moneda, y si difiere de la de la meta el servidor CONVIERTE. Ahí no
 * se anticipa nada: se espera el dato real.
 *
 * DEUDAS: no hay función equivalente a propósito. El saldo de una deuda no es
 * una columna que se decrementa: el servidor lo RECALCULA reproduciendo todos
 * los pagos por el motor de amortización (`debts.balance` es un ancla inmutable,
 * ver `currentDebtBalance`). El cliente manda cuota + extra y no sabe cuánto de
 * la cuota fue interés, así que restar el monto pagado mostraría un saldo que
 * después sube. Anticiparlo bien exigiría el historial de pagos en el cliente,
 * que la vista no tiene.
 */

/** Delta a sumar en la barra. 0 = no anticipar, esperar al servidor. */
export function aporteOptimista(args: {
  /** Lo que se envió: monto y moneda elegidos en el modal. */
  aplicado: { amount: number; currency: string };
  /** Moneda de la entidad cuya barra se mueve. */
  monedaEntidad: string;
}): number {
  const { aplicado, monedaEntidad } = args;
  if (!Number.isFinite(aplicado.amount) || aplicado.amount <= 0) return 0;
  if (aplicado.currency !== monedaEntidad) return 0;
  return aplicado.amount;
}
