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
import { PAID_PLANS, type PaidPlan, type Plan } from "@/lib/plan";

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

export const LOOKUP_KEY: Record<PaidPlan, string> = {
  esencial: "carteraplus_esencial_mensual",
  pro: "carteraplus_pro_mensual",
  max: "carteraplus_max_mensual",
};

const PLAN_POR_LOOKUP: Record<string, PaidPlan> = Object.fromEntries(
  PAID_PLANS.map((p) => [LOOKUP_KEY[p], p]),
) as Record<string, PaidPlan>;

/** Precio vigente de un plan. Lanza si el precio no existe en la cuenta. */
export async function precioDe(plan: PaidPlan): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe no está configurado.");
  const { data } = await stripe.prices.list({
    lookup_keys: [LOOKUP_KEY[plan]],
    active: true,
    limit: 1,
  });
  const precio = data[0];
  if (!precio) throw new Error(`No hay precio activo para ${plan} (${LOOKUP_KEY[plan]}).`);
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

/** Los estados en los que la suscripción da acceso. El resto deja la cuenta sin plan. */
export function suscripcionDaAcceso(estado: Stripe.Subscription.Status): boolean {
  return estado === "active" || estado === "trialing" || estado === "past_due";
}

/** Segundos de época → ISO, o null. Stripe manda epoch; nosotros guardamos timestamptz. */
export function aIso(epoch: number | null | undefined): string | null {
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}
