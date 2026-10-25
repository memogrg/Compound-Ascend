/**
 * ¿Por dónde paga esta cuenta? Puro, sin IO.
 *
 * La tienda gana sobre Stripe: si hay una suscripción viva en App Store / Google Play, ésa es
 * la que se gestiona (y la que no se puede cancelar desde la web). Stripe cuenta solo si hay
 * suscripción y un plan pagado; un `stripe_subscription_id` de una suscripción ya muerta queda
 * en la fila con `plan = 'ninguno'` y no dice nada.
 */
import type { Plan } from "@/lib/plan";

export type OrigenSuscripcion = "stripe" | "store" | "ninguna";

export function origenDeSuscripcion(p: {
  plan: Plan | string | null | undefined;
  store_subscription_active?: boolean | null;
  stripe_subscription_id?: string | null;
}): OrigenSuscripcion {
  if (p.store_subscription_active === true) return "store";
  if (p.stripe_subscription_id && p.plan && p.plan !== "ninguno") return "stripe";
  return "ninguna";
}
