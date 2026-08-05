/**
 * Reglas del PAGO VINCULADO: aportar a una meta de ahorro y pagar la cuota de una deuda.
 *
 * Los dos son el mismo gesto —un gasto del mes atado a una entidad que sube o baja su saldo—, y
 * por eso comparten motor y modal. Separarlos fue lo que hizo que el frasco de Deudas quedara de
 * solo lectura mientras el de Ahorro ganaba su botón; teniéndolos juntos, lo que se arregla en uno
 * queda arreglado en el otro.
 *
 * Puro y sin React: lo consumen el modal de la web, la fila del frasco en Gastos y los formularios
 * del móvil, que tienen primitivos distintos. Lo que no puede divergir es la REGLA.
 *
 * Nota de monedas, que es donde esto se rompe si uno se descuida. El importe se guarda SIEMPRE en
 * la moneda de la entidad: `debt_payments` ni siquiera tiene columna de moneda, así que su
 * `amount` es implícitamente la de la deuda. En cambio los importes que muestra el frasco de
 * Gastos vienen convertidos a la moneda de VISUALIZACIÓN. Mezclarlos guardaría un importe
 * multiplicado por el tipo de cambio sin dejar rastro. Todo lo que entra acá es NATIVO.
 */
import { applyExtraDecision } from "@/modules/control/engine/amortization";

export type PagoKind = "meta" | "deuda";

/** Contexto nativo de la entidad. Todo en su moneda. */
export type PagoContext = {
  kind: PagoKind;
  id: string;
  name: string;
  currency: string;
  /**
   * Lo que se espera este mes: aporte mensual planificado (meta) o cuota vigente (deuda).
   * 0 = la entidad no tiene un compromiso mensual definido.
   */
  compromisoMensual: number;
  /** Ya movido en el mes en curso (suma de las transacciones vinculadas). */
  hechoMes: number;
  /** Solo deuda: saldo, tasa y plazo para estimar el efecto de un abono extra. */
  balance?: number;
  apr?: number | null;
  termMonths?: number | null;
  insurance?: number | null;
};

/**
 * Monto a precargar: lo que FALTA del compromiso del mes, no el compromiso entero. Si ya se
 * aportó ₡30.000 de ₡50.000, proponer ₡50.000 otra vez duplicaría el mes de quien mueve la plata
 * en dos partes — que es justo lo que hace la gente que cobra dos veces al mes.
 *
 * Si el mes ya está cubierto (o no hay compromiso mensual) no se precarga nada: que el usuario
 * diga cuánto, en vez de aceptar un número que no pidió.
 */
export function montoSugerido(ctx: Pick<PagoContext, "compromisoMensual" | "hechoMes">): number {
  if (ctx.compromisoMensual <= 0) return 0;
  const falta = ctx.compromisoMensual - ctx.hechoMes;
  return falta > 0 ? Math.round(falta * 100) / 100 : 0;
}

export type AvanceMes = {
  /** Fracción 0..1 del compromiso mensual cubierta. 0 si no hay compromiso mensual. */
  progreso: number;
  /** true = este mes todavía no tiene ningún movimiento (señal de pendiente). */
  pendiente: boolean;
  /** true = el mes ya está cubierto. */
  cubierto: boolean;
};

export function avanceMes(ctx: Pick<PagoContext, "compromisoMensual" | "hechoMes">): AvanceMes {
  const pendiente = ctx.hechoMes <= 0;
  if (ctx.compromisoMensual <= 0) {
    return { progreso: 0, pendiente, cubierto: !pendiente };
  }
  return {
    progreso: Math.min(1, ctx.hechoMes / ctx.compromisoMensual),
    pendiente,
    cubierto: ctx.hechoMes >= ctx.compromisoMensual,
  };
}

/**
 * Línea de avance del mes. `fmt` se inyecta (formatMoney) para no arrastrar el formateo acá y
 * poder probar el texto con un formateador trivial.
 */
export function textoAvanceMes(
  ctx: Pick<PagoContext, "kind" | "compromisoMensual" | "hechoMes" | "currency">,
  fmt: (monto: number, moneda: string) => string,
): string {
  const { hechoMes: hecho, compromisoMensual: plan, currency, kind } = ctx;
  const nada = kind === "deuda" ? "Sin pago este mes" : "Sin aporte este mes";
  if (plan <= 0) return hecho > 0 ? `Llevás ${fmt(hecho, currency)} este mes` : nada;
  if (hecho <= 0) return `${nada} · ${kind === "deuda" ? "cuota" : "plan"} ${fmt(plan, currency)}`;
  // "Cuota pagada" dice algo que "₡X de ₡X" obliga a deducir comparando dos números.
  if (hecho >= plan) {
    return kind === "deuda"
      ? `Cuota pagada${hecho > plan ? ` · ${fmt(hecho - plan, currency)} extra` : ""}`
      : `Aporte del mes cubierto${hecho > plan ? ` · ${fmt(hecho - plan, currency)} extra` : ""}`;
  }
  return `Llevás ${fmt(hecho, currency)} de ${fmt(plan, currency)} este mes`;
}

export type Desglose = {
  /** Parte que cubre la cuota del mes. */
  cuota: number;
  /** Excedente que amortiza capital directo. */
  extra: number;
  /** Meses que se adelantan con ese extra. `null` cuando el motor no lo puede estimar. */
  mesesAdelantados: number | null;
};

/**
 * Desglose EN VIVO de un pago de deuda: cuánto cubre la cuota y cuánto amortiza capital.
 *
 * Espeja `estimatePaymentSplit`, que es lo que el servidor va a aplicar igual — mostrarlo antes
 * evita la sorpresa de descubrir después que la mitad del pago se fue a capital.
 *
 * Los meses adelantados solo se estiman cuando hay con qué (tasa y cuota reales): sin tasa, el
 * cronograma no significa nada y un número inventado sería peor que no decir nada.
 */
export function desglosePago(ctx: PagoContext, total: number): Desglose {
  const cuotaPlan = ctx.compromisoMensual;
  if (total <= 0) return { cuota: 0, extra: 0, mesesAdelantados: null };
  const cuota = cuotaPlan > 0 ? Math.min(total, cuotaPlan) : total;
  const extra = Math.round(Math.max(0, total - cuota) * 100) / 100;

  const base: Desglose = { cuota: Math.round(cuota * 100) / 100, extra, mesesAdelantados: null };
  if (
    ctx.kind !== "deuda" ||
    extra <= 0 ||
    !ctx.apr ||
    ctx.apr <= 0 ||
    !ctx.balance ||
    ctx.balance <= 0 ||
    cuotaPlan <= 0
  ) {
    return base;
  }

  try {
    const input = {
      balance: ctx.balance,
      apr: ctx.apr,
      termMonths: ctx.termMonths ?? null,
      monthlyPayment: cuotaPlan,
      insurance: ctx.insurance ?? null,
    };
    const sinExtra = applyExtraDecision(input, 0, "tiempo");
    const conExtra = applyExtraDecision(input, extra, "tiempo");
    const ahorro = sinExtra.months - conExtra.months;
    return { ...base, mesesAdelantados: ahorro > 0 ? ahorro : null };
  } catch {
    // El cronograma puede no converger con datos raros (cuota menor al interés). Preferimos no
    // decir nada antes que mostrar un número que no se sostiene.
    return base;
  }
}

export type PagoErrores = {
  monto?: string;
  moneda?: string;
  fecha?: string;
};

/**
 * Qué impide registrar. La moneda se valida ACÁ además de en el servidor: el servicio la rechaza
 * (`monedaDelPagoEsCoherente` / `monedaVinculadaEsCoherente`), pero decirlo recién después de
 * tocar el botón obliga a un viaje de ida y vuelta para enterarse de algo que se sabe al elegirla.
 */
export function validarPago(args: {
  monto: number | null;
  moneda: string;
  fecha: string;
  ctx: Pick<PagoContext, "currency" | "kind">;
  hoy: string;
}): PagoErrores {
  const e: PagoErrores = {};

  if (args.monto === null) e.monto = "Ingresá un monto";
  else if (args.monto <= 0) e.monto = "El monto tiene que ser mayor que cero";

  if (args.moneda !== args.ctx.currency) {
    const quien = args.ctx.kind === "deuda" ? "la deuda está" : "la meta está";
    e.moneda = `${quien} en ${args.ctx.currency}; un movimiento en ${args.moneda} no se puede registrar.`;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.fecha)) e.fecha = "Fecha inválida";
  else if (args.fecha > args.hoy) e.fecha = "La fecha no puede ser futura";

  return e;
}

export function pagoValido(args: Parameters<typeof validarPago>[0]): boolean {
  return Object.keys(validarPago(args)).length === 0;
}
