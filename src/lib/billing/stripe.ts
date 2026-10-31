import "server-only";

/**
 * Cliente de Stripe y el puente entre nuestros planes y sus precios.
 *
 * Los precios se resuelven por `lookup_key`, no por un id pegado en el código:
 * un id de precio cambia cada vez que se toca el monto, y un id viejo en una
 * variable de entorno cobra el precio anterior sin avisar. El lookup_key
 * sobrevive a los cambios de precio.
 *
 * Si no hay `STRIPE_SECRET_KEY`, `getStripe()` devuelve null y quien llama lo
 * maneja: la app corre sin cobro en vez de reventar.
 */
import Stripe from "stripe";
import { PAID_PLANS, PERIODOS, type PaidPlan, type Periodo, type Plan } from "@/lib/plan";

let cliente: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cliente) cliente = new Stripe(key);
  return cliente;
}

export function stripeConfigurado(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export const LOOKUP_KEY: Record<PaidPlan, Record<Periodo, string>> = {
  esencial: { mensual: "carteraplus_esencial_mensual", anual: "carteraplus_esencial_anual" },
  pro: { mensual: "carteraplus_pro_mensual", anual: "carteraplus_pro_anual" },
  max: { mensual: "carteraplus_max_mensual", anual: "carteraplus_max_anual" },
};

/**
 * Las seis keys → plan. Tienen que estar TODAS: el webhook resuelve el plan por acá, y un
 * precio que no reconoce deja la suscripción cobrando sin dar el plan.
 */
const PLAN_POR_LOOKUP: Record<string, PaidPlan> = Object.fromEntries(
  PAID_PLANS.flatMap((p) => PERIODOS.map((per) => [LOOKUP_KEY[p][per], p])),
) as Record<string, PaidPlan>;

const PERIODO_POR_LOOKUP: Record<string, Periodo> = Object.fromEntries(
  PAID_PLANS.flatMap((p) => PERIODOS.map((per) => [LOOKUP_KEY[p][per], per])),
) as Record<string, Periodo>;

/**
 * El precio de ese plan y período no existe (o no está activo) en la cuenta de Stripe. Quien
 * llama NO debe caer a otro período: cobrar el mensual a quien eligió el anual es peor que no
 * abrir el pago.
 */
export class PrecioNoDisponible extends Error {
  constructor(
    readonly plan: PaidPlan,
    readonly periodo: Periodo,
  ) {
    super(`No hay precio activo para ${plan} ${periodo} (${LOOKUP_KEY[plan][periodo]}).`);
    this.name = "PrecioNoDisponible";
  }
}

/** Precio vigente de un plan en un período. Lanza `PrecioNoDisponible` si no existe. */
export async function precioDe(plan: PaidPlan, periodo: Periodo): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe no está configurado.");
  const { data } = await stripe.prices.list({
    lookup_keys: [LOOKUP_KEY[plan][periodo]],
    active: true,
    limit: 1,
  });
  const precio = data[0];
  if (!precio) throw new PrecioNoDisponible(plan, periodo);
  return precio.id;
}

/**
 * De una suscripción de Stripe al plan nuestro.
 *
 * Se resuelve por `lookup_key` y, si falta, por la metadata del precio. Si no se
 * puede identificar, devuelve null y quien llama NO toca el plan: es preferible
 * dejar la cuenta como está que degradarla por un evento que no entendimos.
 */
export function planDeSuscripcion(sub: Stripe.Subscription): Plan | null {
  const item = sub.items?.data?.[0];
  const precio = item?.price;
  if (!precio) return null;

  const porLookup = precio.lookup_key ? PLAN_POR_LOOKUP[precio.lookup_key] : undefined;
  if (porLookup) return porLookup;

  const meta = precio.metadata?.plan;
  if (meta && (PAID_PLANS as readonly string[]).includes(meta)) return meta as PaidPlan;
  return null;
}

/**
 * Cada cuánto cobra una suscripción de Stripe. Manda el intervalo del precio (sirve aunque
 * falte el lookup_key); si no viene, el lookup_key. null si no se puede saber.
 */
export function periodoDeSuscripcion(sub: Stripe.Subscription): Periodo | null {
  const precio = sub.items?.data?.[0]?.price;
  if (!precio) return null;
  const intervalo = precio.recurring?.interval;
  if (intervalo === "year") return "anual";
  if (intervalo === "month") return "mensual";
  return (precio.lookup_key ? PERIODO_POR_LOOKUP[precio.lookup_key] : undefined) ?? null;
}

/** Los estados en los que la suscripción da acceso. El resto deja la cuenta sin plan. */
export function suscripcionDaAcceso(estado: Stripe.Subscription.Status): boolean {
  return estado === "active" || estado === "trialing" || estado === "past_due";
}

/** Segundos de época → ISO, o null. Stripe manda epoch; nosotros guardamos timestamptz. */
export function aIso(epoch: number | null | undefined): string | null {
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}
