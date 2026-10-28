/**
 * El detalle de la suscripción propia (período y fecha de renovación) que muestran Ajustes web y
 * /m/perfil. Puro, sin IO: el servicio `subscription-detail.ts` lee el perfil y Stripe y decide
 * con esto.
 */
import { PLAN_LABEL, isPaidPlan, type PaidPlan, type Periodo, type Plan } from "@/lib/plan";
import { productoDeTienda } from "@/lib/billing/store-products";
import type { OrigenSuscripcion } from "@/lib/billing/subscription-source";
import { formatDateLong } from "@/lib/format";

/** Qué pasa al llegar `renuevaEl`: se renueva igual, la cuenta queda sin plan, o pasa a otro. */
export type AlVencer = { tipo: "renueva" } | { tipo: "termina" } | { tipo: "cambia"; a: PaidPlan };

export type DetalleSuscripcion = {
  periodo: Periodo;
  /** Fin del período pagado: la próxima renovación, el último día o el día del cambio. */
  renuevaEl: string | null;
  alVencer: AlVencer;
};

/**
 * La cuenta termina si se canceló (Stripe) o si lo pendiente es quedarse sin plan; cambia si lo
 * pendiente es otro plan pago. Un pendiente igual al actual no cambia nada.
 */
export function alVencer(p: {
  plan: Plan;
  plan_pending: Plan | null;
  cancelaAlFinal?: boolean;
}): AlVencer {
  if (p.cancelaAlFinal || p.plan_pending === "ninguno") return { tipo: "termina" };
  if (p.plan_pending && isPaidPlan(p.plan_pending) && p.plan_pending !== p.plan) {
    return { tipo: "cambia", a: p.plan_pending };
  }
  return { tipo: "renueva" };
}

/**
 * De dónde sale el detalle, o null si no se muestra. Quien hereda el plan del hogar
 * (`planEfectivo` distinto del propio) no ve período ni fecha: no es lo que paga, y ya tiene el
 * «Incluido en tu hogar».
 */
export function fuenteDelDetalle(p: {
  origen: OrigenSuscripcion;
  plan: Plan;
  planEfectivo: Plan;
}): "store" | "stripe" | null {
  if (p.planEfectivo !== p.plan) return null;
  return p.origen === "ninguna" ? null : p.origen;
}

/** Tienda: el período sale del producto; qué pasa al vencer, de `plan_pending`. */
export function detalleDeTienda(p: {
  plan: Plan;
  store_product_id: string | null;
  store_period_end: string | null;
  plan_pending: Plan | null;
}): DetalleSuscripcion | null {
  const periodo = productoDeTienda(p.store_product_id)?.periodo;
  if (!periodo) return null;
  return {
    periodo,
    renuevaEl: p.store_period_end,
    alVencer: alVencer({ plan: p.plan, plan_pending: p.plan_pending }),
  };
}

/** Stripe, ya leído y traducido: sin período reconocible no hay detalle. */
export function detalleDeStripe(p: {
  plan: Plan;
  plan_pending: Plan | null;
  periodo: Periodo | null;
  finDePeriodo: string | null;
  cancelaAlFinal: boolean;
}): DetalleSuscripcion | null {
  if (!p.periodo) return null;
  return { periodo: p.periodo, renuevaEl: p.finDePeriodo, alVencer: alVencer(p) };
}

/**
 * «Se renueva el 12 de noviembre de 2026» / «Termina el …» / «Cambia a Esencial+ el …», o null
 * si no hay fecha.
 */
export function lineaDeRenovacion(d: DetalleSuscripcion): string | null {
  if (!d.renuevaEl) return null;
  const fecha = formatDateLong(d.renuevaEl);
  switch (d.alVencer.tipo) {
    case "termina":
      return `Termina el ${fecha}`;
    case "cambia":
      return `Cambia a ${PLAN_LABEL[d.alVencer.a]} el ${fecha}`;
    case "renueva":
      return `Se renueva el ${fecha}`;
  }
}
