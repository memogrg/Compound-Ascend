/**
 * Ofertas de la tienda → lo que muestra el paywall. Puro, sin IO.
 *
 * El paywall muestra SOLO lo que devuelve la tienda: el precio es `product.priceString` tal
 * cual (moneda y formato de la tienda, nunca uno nuestro). De acá sale únicamente qué plan y
 * qué período es cada paquete, y en qué orden van: Esencial+ → Pro+ → Max+. Un producto que no
 * es nuestro no se muestra, y si la oferta trae dos paquetes del mismo plan y período queda el
 * primero.
 */
import { productoDeTienda } from "@/lib/billing/store-products";
import { PLAN_RANK, type PaidPlan, type Periodo } from "@/lib/plan";

/** Un plan con su paquete de cada período; null si la oferta no trae ese período. */
export type PlanConPeriodos<P> = { plan: PaidPlan } & Record<Periodo, P | null>;

export function agruparPorPlan<P extends { product: { identifier: string } }>(
  paquetes: readonly P[],
): PlanConPeriodos<P>[] {
  const porPlan = new Map<PaidPlan, PlanConPeriodos<P>>();
  for (const paquete of paquetes) {
    const producto = productoDeTienda(paquete.product.identifier);
    if (!producto) continue;
    const grupo = porPlan.get(producto.plan) ?? { plan: producto.plan, mensual: null, anual: null };
    if (grupo[producto.periodo] === null) grupo[producto.periodo] = paquete;
    porPlan.set(producto.plan, grupo);
  }
  return [...porPlan.values()].sort((a, b) => PLAN_RANK[a.plan] - PLAN_RANK[b.plan]);
}

/**
 * Cuánto se ahorra, en %, pagando el año en vez de doce meses. Redondea hacia ABAJO: nunca se
 * promete más ahorro del real. Null si falta un precio, no es válido o el anual no ahorra al
 * menos 1 %: en ese caso no se dice nada.
 */
export function ahorroAnual(
  mensual: { product: { price: number } } | null,
  anual: { product: { price: number } } | null,
): number | null {
  const m = mensual?.product.price;
  const a = anual?.product.price;
  if (!m || !a || !Number.isFinite(m) || !Number.isFinite(a) || m <= 0 || a <= 0) return null;
  const pct = Math.floor((1 - a / (12 * m)) * 100);
  return pct >= 1 ? pct : null;
}

/** Una tarjeta del paywall: el paquete del período elegido y, en el anual, cuánto ahorra. */
export type Tarjeta<P> = { plan: PaidPlan; paquete: P; ahorro: number | null };

/**
 * Las tarjetas del período elegido, en el orden de los planes. Un plan sin paquete de ese
 * período no tiene tarjeta (no se ofrece lo que la tienda no trae).
 */
export function tarjetasDelPeriodo<P extends { product: { identifier: string; price: number } }>(
  grupos: readonly PlanConPeriodos<P>[],
  periodo: Periodo,
): Tarjeta<P>[] {
  const out: Tarjeta<P>[] = [];
  for (const g of grupos) {
    const paquete = g[periodo];
    if (!paquete) continue;
    out.push({
      plan: g.plan,
      paquete,
      ahorro: periodo === "anual" ? ahorroAnual(g.mensual, g.anual) : null,
    });
  }
  return out;
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
