/**
 * Qué monto original se guarda al DAR DE ALTA una deuda.
 *
 * Por qué existe. El saldo de una deuda se deriva de sus pagos (`recomputeFromPayments`), y ese
 * replay arranca de `originalAmount ?? balance`. Sin monto original, el ancla es el saldo
 * GUARDADO — un valor que se mueve al editar la deuda o al abonar en modo 'cuota'. Cuando se
 * mueve, los pagos anteriores se vuelven a descontar sobre el saldo nuevo y el resultado queda
 * subestimado. Guardar el original al alta fija un ancla que ya no se mueve.
 *
 * En el alta el saldo ACTUAL es el original: todavía no hay ningún pago registrado contra la
 * deuda, así que los dos números son el mismo por definición. No se está inventando un dato —
 * se está anotando el que ya se conoce, en el único momento en que se conoce sin ambigüedad.
 *
 * Solo al ALTA. En una edición, reescribir el original desde el saldo actual borraría el punto de
 * partida de una deuda ya amortizada: la barra de progreso saltaría a cero y el replay perdería
 * su ancla.
 */
export function montoOriginalAlAlta(input: {
  originalAmount?: number | undefined;
  balance: number;
}): number {
  // Un original explícito manda: quien lo escribe sabe de qué monto arrancó la deuda, que puede
  // ser muy anterior a darla de alta en la app.
  if (typeof input.originalAmount === "number" && input.originalAmount > 0) {
    return input.originalAmount;
  }
  return input.balance;
}
