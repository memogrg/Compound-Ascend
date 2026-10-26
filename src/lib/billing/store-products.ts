/**
 * Productos de las tiendas (App Store / Google Play) → nuestro plan. Puro, sin IO.
 *
 * Los ids los da de alta cada tienda y RevenueCat los manda tal cual en el webhook. Google
 * Play los manda con el base plan pegado («cartera_proplus_mensual:mensual»): lo que manda es lo
 * de antes de los dos puntos.
 */
import type { PaidPlan } from "@/lib/plan";

export const PRODUCT_TO_PLAN: Record<string, PaidPlan> = {
  cartera_esencial_mensual: "esencial",
  cartera_proplus_mensual: "pro",
  cartera_maxplus_mensual: "max",
};

/** Entitlements de RevenueCat, por nombre. */
export const ENTITLEMENT_TO_PLAN: Record<string, PaidPlan> = {
  esencial: "esencial",
  pro: "pro",
  max: "max",
};

/** Plan de un producto de tienda, o null si no es nuestro. */
export function planDeProducto(productId: string | null | undefined): PaidPlan | null {
  if (!productId) return null;
  const base = productId.split(":")[0] ?? "";
  return PRODUCT_TO_PLAN[base] ?? null;
}

/** Plan de una lista de entitlements: el primero que reconocemos. */
export function planDeEntitlements(ids: readonly string[] | null | undefined): PaidPlan | null {
  for (const id of ids ?? []) {
    const plan = ENTITLEMENT_TO_PLAN[id];
    if (plan) return plan;
  }
  return null;
}
