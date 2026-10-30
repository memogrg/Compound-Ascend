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
import {
  INTRO_ELIGIBILITY_STATUS,
  type IntroEligibilityStatus,
  type PurchasesStoreProduct,
} from "@/lib/capacitor/native";
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

/**
 * ¿Google Play rechazó el reemplazo de la suscripción? Play contesta DEVELOPER_ERROR cuando el
 * `oldProductIdentifier` no es lo que tiene vivo o ya hay un reemplazo diferido esperando, y el
 * SDK de Android (purchases 9.18.0, `billingResponseToPurchasesError`) lo traduce a
 * PURCHASE_INVALID_ERROR, `code: "4"`. Red, tienda caída o cualquier otro código no cuentan:
 * ahí el mensaje genérico de «intentá de nuevo» es el correcto.
 */
export function esCambioRechazado(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === "4" || code === 4;
}

/** La prueba gratis de un producto, tal como la configura la tienda. */
export type PruebaGratis = { cantidad: number; unidad: "dia" | "semana" | "mes" | "año" };

const UNIDAD_TIENDA: Record<string, PruebaGratis["unidad"]> = {
  DAY: "dia",
  WEEK: "semana",
  MONTH: "mes",
  YEAR: "año",
};

const UNIDAD_ISO: Record<string, PruebaGratis["unidad"]> = {
  D: "dia",
  W: "semana",
  M: "mes",
  Y: "año",
};

function prueba(
  cantidad: number,
  unidad: PruebaGratis["unidad"] | undefined,
  veces: number | null,
): PruebaGratis | null {
  const total = cantidad * (veces && veces > 0 ? veces : 1);
  if (!unidad || !Number.isInteger(total) || total <= 0) return null;
  return { cantidad: total, unidad };
}

/**
 * La prueba gratis que la tienda le ofrece a esta persona en este producto, o null. Nada fijo:
 * la duración sale de la tienda.
 *  · iOS: solo con un precio introductorio de 0 Y elegibilidad confirmada (2). Desconocida (0),
 *    no elegible (1), sin oferta (3) o consulta fallida (null) → null: ante la duda se muestra
 *    el precio sin prueba, que es lo que cobra la tienda.
 *  · Android: la fase gratis de la opción por defecto (Play ya filtra las ofertas a las que no
 *    tiene derecho; su elegibilidad siempre es 0, así que no se mira).
 */
export function pruebaGratis(
  producto: Pick<PurchasesStoreProduct, "introPrice" | "defaultOption">,
  plataforma: "ios" | "android",
  elegibilidad: IntroEligibilityStatus | null,
): PruebaGratis | null {
  if (plataforma === "ios") {
    const intro = producto.introPrice;
    if (!intro || intro.price !== 0) return null;
    if (elegibilidad !== INTRO_ELIGIBILITY_STATUS.ELIGIBLE) return null;
    return prueba(intro.periodNumberOfUnits, UNIDAD_TIENDA[intro.periodUnit], intro.cycles);
  }
  const fase = producto.defaultOption?.freePhase;
  if (!fase) return null;
  const iso = /^P(\d+)([DWMY])$/.exec(fase.billingPeriod.iso8601);
  if (!iso) return null;
  return prueba(Number(iso[1]), UNIDAD_ISO[iso[2] ?? ""], fase.billingCycleCount);
}

/**
 * «Los primeros 14 días», «El primer mes», «Los primeros 2 meses». Días y semanas se dicen en
 * días (como lo dice la hoja de Apple); meses y años no se convierten: no tienen días fijos.
 */
export function textoPrueba(p: PruebaGratis): string {
  if (p.unidad === "dia" || p.unidad === "semana") {
    const dias = p.unidad === "semana" ? p.cantidad * 7 : p.cantidad;
    return dias === 1 ? "El primer día" : `Los primeros ${dias} días`;
  }
  if (p.unidad === "mes")
    return p.cantidad === 1 ? "El primer mes" : `Los primeros ${p.cantidad} meses`;
  return p.cantidad === 1 ? "El primer año" : `Los primeros ${p.cantidad} años`;
}

/** «Los primeros 14 días son gratis. Después, USD 4.99 por mes.» (y «El primer mes es gratis…»). */
export function frasePrueba(p: PruebaGratis, priceString: string, por: string): string {
  const texto = textoPrueba(p);
  const verbo = texto.startsWith("El ") ? "es" : "son";
  return `${texto} ${verbo} gratis. Después, ${priceString} ${por}.`;
}
