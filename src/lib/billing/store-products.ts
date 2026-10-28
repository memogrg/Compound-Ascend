/**
 * Productos de las tiendas (App Store / Google Play) → nuestro plan y su período. Puro, sin IO.
 *
 * Los ids los da de alta cada tienda y RevenueCat los manda tal cual en el webhook. Google
 * Play los manda con el base plan pegado («cartera_proplus_mensual:mensual»): el plan sale de
 * lo de antes de los dos puntos y el período del base plan (`:anual` es anual). Apple no tiene
 * base plans: el anual es otro producto (`cartera_proplus_anual`).
 */
import type { PaidPlan, Periodo } from "@/lib/plan";

export type { Periodo } from "@/lib/plan";

export type ProductoTienda = { plan: PaidPlan; periodo: Periodo };

export const PRODUCTOS_TIENDA: Record<string, ProductoTienda> = {
  cartera_esencial_mensual: { plan: "esencial", periodo: "mensual" },
  cartera_proplus_mensual: { plan: "pro", periodo: "mensual" },
  cartera_maxplus_mensual: { plan: "max", periodo: "mensual" },
  // Solo Apple: en Play el anual es el base plan `anual` del producto mensual.
  cartera_esencial_anual: { plan: "esencial", periodo: "anual" },
  cartera_proplus_anual: { plan: "pro", periodo: "anual" },
  cartera_maxplus_anual: { plan: "max", periodo: "anual" },
};

/** Entitlements de RevenueCat, por nombre. */
export const ENTITLEMENT_TO_PLAN: Record<string, PaidPlan> = {
  esencial: "esencial",
  pro: "pro",
  max: "max",
};

/** Plan y período de un producto de tienda, o null si no es nuestro. */
export function productoDeTienda(productId: string | null | undefined): ProductoTienda | null {
  if (!productId) return null;
  const [base = "", basePlan] = productId.split(":");
  const producto = PRODUCTOS_TIENDA[base];
  if (!producto) return null;
  if (basePlan === "anual") return { plan: producto.plan, periodo: "anual" };
  return producto;
}

/** Plan de un producto de tienda, o null si no es nuestro. */
export function planDeProducto(productId: string | null | undefined): PaidPlan | null {
  return productoDeTienda(productId)?.plan ?? null;
}

/** Plan de una lista de entitlements: el primero que reconocemos. */
export function planDeEntitlements(ids: readonly string[] | null | undefined): PaidPlan | null {
  for (const id of ids ?? []) {
    const plan = ENTITLEMENT_TO_PLAN[id];
    if (plan) return plan;
  }
  return null;
}
