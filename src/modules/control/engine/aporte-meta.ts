/**
 * Reglas del APORTE a una meta de ahorro: cuánto sugerir, cómo se lee el avance del mes y qué
 * bloquea el registro.
 *
 * Puro y sin React porque lo consumen tres superficies con primitivos distintos —el modal de
 * Ahorro (web), la fila del frasco "Ahorro a largo plazo" en Gastos (web) y el formulario de
 * metas del móvil—, y lo que no puede divergir entre ellas es la REGLA, no el markup.
 *
 * Nota de monedas, que es donde esto se rompe si uno se descuida. El aporte se registra SIEMPRE
 * en la moneda de la meta: `addGoalContribution` construye la transacción con `goal.currency`.
 * En cambio, los importes que muestra el frasco de Gastos (`JarItem.budget`/`spent`) vienen
 * convertidos a la moneda de VISUALIZACIÓN. Mezclarlos —precargar el sugerido desde el frasco y
 * guardarlo como nativo— registraría un importe multiplicado por el tipo de cambio sin dejar
 * rastro. Por eso todo lo que entra acá es NATIVO de la meta.
 */

/** Contexto nativo de la meta que necesita el modal. Todo en la moneda de la meta. */
export type AporteContext = {
  goalId: string;
  goalName: string;
  currency: string;
  /** Aporte mensual planificado. 0 = la meta no tiene plan mensual. */
  monthlyContribution: number;
  currentAmount: number;
  targetAmount: number;
  /** Ya aportado en el mes en curso (suma de las transacciones vinculadas). */
  aportadoMes: number;
};

/**
 * Monto a precargar: lo que FALTA del aporte mensual, no el aporte entero. Si ya se aportó
 * ₡30.000 de ₡50.000, proponer ₡50.000 otra vez duplicaría el mes de quien aporta en partes —
 * que es justo lo que hace la gente que cobra dos veces al mes.
 *
 * Si el mes ya está cubierto (o no hay plan mensual) no se precarga nada: que el usuario diga
 * cuánto, en vez de aceptar un número que no pidió.
 */
export function montoSugerido(ctx: Pick<AporteContext, "monthlyContribution" | "aportadoMes">): number {
  if (ctx.monthlyContribution <= 0) return 0;
  const falta = ctx.monthlyContribution - ctx.aportadoMes;
  return falta > 0 ? Math.round(falta * 100) / 100 : 0;
}

export type AvanceMes = {
  /** Fracción 0..1 del aporte mensual cubierta. 0 si no hay plan mensual. */
  progreso: number;
  /** true = este mes todavía no tiene ningún aporte (señal de pendiente). */
  pendiente: boolean;
  /** true = el mes ya está cubierto. */
  cubierto: boolean;
};

export function avanceMes(ctx: Pick<AporteContext, "monthlyContribution" | "aportadoMes">): AvanceMes {
  const pendiente = ctx.aportadoMes <= 0;
  if (ctx.monthlyContribution <= 0) {
    return { progreso: 0, pendiente, cubierto: !pendiente };
  }
  const progreso = Math.min(1, ctx.aportadoMes / ctx.monthlyContribution);
  return { progreso, pendiente, cubierto: ctx.aportadoMes >= ctx.monthlyContribution };
}

/**
 * Línea de avance del mes. `fmt` se inyecta (formatMoney) para no arrastrar el formateo acá y
 * poder probar el texto con un formateador trivial.
 */
export function textoAvanceMes(
  ctx: Pick<AporteContext, "monthlyContribution" | "aportadoMes" | "currency">,
  fmt: (monto: number, moneda: string) => string,
): string {
  const { aportadoMes: hecho, monthlyContribution: plan, currency } = ctx;
  if (plan <= 0) {
    return hecho > 0
      ? `Llevás ${fmt(hecho, currency)} este mes`
      : "Sin aporte este mes";
  }
  if (hecho <= 0) return `Sin aporte este mes · plan ${fmt(plan, currency)}`;
  return `Llevás ${fmt(hecho, currency)} de ${fmt(plan, currency)} este mes`;
}

export type AporteErrores = {
  monto?: string;
  moneda?: string;
  fecha?: string;
};

/**
 * Qué impide registrar. La moneda se valida ACÁ además de en el servidor: el servicio la
 * rechaza (`monedaVinculadaEsCoherente`), pero decirlo recién después de tocar "Registrar"
 * obliga a un viaje de ida y vuelta para enterarse de algo que se sabe al elegirla.
 */
export function validarAporte(args: {
  monto: number | null;
  moneda: string;
  fecha: string;
  ctx: Pick<AporteContext, "currency">;
  hoy: string;
}): AporteErrores {
  const e: AporteErrores = {};

  if (args.monto === null) e.monto = "Ingresá un monto";
  else if (args.monto <= 0) e.monto = "El monto tiene que ser mayor que cero";

  if (args.moneda !== args.ctx.currency) {
    e.moneda = `La meta está en ${args.ctx.currency}; un aporte en ${args.moneda} no se puede registrar.`;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fecha)) e.fecha = "Fecha inválida";
  else if (args.fecha > args.hoy) e.fecha = "La fecha no puede ser futura";

  return e;
}

export function aporteValido(args: Parameters<typeof validarAporte>[0]): boolean {
  return Object.keys(validarAporte(args)).length === 0;
}
