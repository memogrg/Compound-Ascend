/**
 * Ofertas de la tienda → lo que muestra el paywall. Puro, sin IO.
 *
 * El paywall muestra SOLO lo que devuelve la tienda: el precio es `product.priceString` tal
 * cual (moneda y formato de la tienda, nunca uno nuestro). De acá sale únicamente qué plan es
 * cada paquete y en qué orden van: Esencial+ → Pro+ → Max+. Un producto que no es nuestro no
 * se muestra, y si la oferta trae dos paquetes del mismo plan queda el primero.
 */
import { planDeProducto } from "@/lib/billing/store-products";
import { PLAN_RANK, type PaidPlan } from "@/lib/plan";

export type PaqueteConPlan<P> = { paquete: P; plan: PaidPlan };

export function ordenarOfertas<P extends { product: { identifier: string } }>(
  paquetes: readonly P[],
): PaqueteConPlan<P>[] {
  const vistos = new Set<PaidPlan>();
  const out: PaqueteConPlan<P>[] = [];
  for (const paquete of paquetes) {
    const plan = planDeProducto(paquete.product.identifier);
    if (!plan || vistos.has(plan)) continue;
    vistos.add(plan);
    out.push({ paquete, plan });
  }
  return out.sort((a, b) => PLAN_RANK[a.plan] - PLAN_RANK[b.plan]);
}

/**
 * ¿El rechazo de `purchasePackage` es que la persona cerró la hoja de pago? El plugin rechaza
 * con `code: "1"` (PURCHASE_CANCELLED_ERROR) en iOS y Android; Android además manda
 * `userCancelled` en `data`. Cancelar no es un error: no se muestra nada.
 */
export function esCompraCancelada(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; userCancelled?: unknown; data?: unknown };
  if (e.code === "1" || e.code === 1 || e.userCancelled === true) return true;
  const data = e.data as { userCancelled?: unknown } | undefined;
  return data?.userCancelled === true;
}
