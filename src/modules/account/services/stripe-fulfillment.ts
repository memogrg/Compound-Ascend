import "server-only";

/**
 * CUMPLIMIENTO de una suscripción de Stripe: de un objeto `Subscription` al
 * estado de la cuenta. Es la ÚNICA función que cambia `profiles.plan` a partir
 * de Stripe, y la llaman DOS caminos:
 *
 *  · el webhook (`checkout.session.completed`, `customer.subscription.*`), que
 *    es la fuente de verdad que Stripe exige para suscripciones, y
 *  · la página de bienvenida al volver del checkout, con el `session_id` en la
 *    URL — porque Stripe no garantiza que el webhook llegue antes que la persona
 *    («You can't rely on triggering fulfillment only from your checkout landing
 *    page… Automatic fulfillment with webhooks is required if you sell
 *    subscriptions», docs.stripe.com/checkout/fulfillment).
 *
 * Por eso vive acá y no dentro de la ruta del webhook: las dos puertas tienen
 * que ejecutar exactamente el mismo código. Es IDEMPOTENTE por construcción —
 * escribe el estado que Stripe dice que hay, no acumula—, así que llamarla dos
 * veces (o a la vez) con la misma suscripción deja el mismo resultado.
 *
 * Las reglas que implementa:
 *  · Alta o subida de plan → se aplica de una.
 *  · Cancelación (`cancel_at_period_end`) → NO se corta hoy: se programa la
 *    bajada a `ninguno` para el fin del período ya pagado.
 *  · Cambio a un plan menor → misma historia: se programa, no se aplica.
 *  · Suscripción muerta → se aplica `ninguno` y con eso corre la orfandad.
 *
 * Si un evento no se puede mapear a un plan nuestro, NO se toca la cuenta:
 * dejarla como está es mejor que degradarla por un evento que no entendimos.
 */
import type Stripe from "stripe";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { getStripe, planDeSuscripcion, suscripcionDaAcceso, aIso } from "@/lib/billing/stripe";
import { aplicarPlan } from "@/modules/account/services/subscription-service";
import { isDowngrade, type Plan } from "@/lib/plan";

/** Del cliente de Stripe a nuestro usuario. Primero la metadata, después la tabla. */
async function usuarioDe(sub: Stripe.Subscription): Promise<string | null> {
  const porMeta = sub.metadata?.userId;
  if (porMeta) return porMeta;

  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customer) return null;

  const { data } = await createServiceRoleClient()
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function manejarSuscripcion(sub: Stripe.Subscription): Promise<void> {
  const userId = await usuarioDe(sub);
  if (!userId) {
    logger.warn("webhook stripe: suscripción sin usuario", { sub: sub.id });
    return;
  }

  const db = createServiceRoleClient();
  const item = sub.items?.data?.[0];
  const finPeriodo = aIso(item?.current_period_end);
  const finPrueba = aIso(sub.trial_end);

  // El id de la suscripción y las fechas se guardan siempre: son el reloj del
  // que depende la bajada programada.
  await db
    .from("profiles")
    .update({
      stripe_subscription_id: sub.id,
      period_end: finPeriodo,
      trial_ends_at: finPrueba,
    })
    .eq("id", userId);

  const plan = planDeSuscripcion(sub);
  const viva = suscripcionDaAcceso(sub.status);

  // Suscripción muerta: sin plan, y con eso corre la orfandad.
  if (!viva) {
    await aplicarPlan(userId, "ninguno", { periodEnd: finPeriodo, trialEndsAt: finPrueba });
    logger.info("webhook stripe: cuenta sin plan", { estado: sub.status });
    return;
  }

  if (!plan) {
    logger.warn("webhook stripe: precio sin plan reconocible", { sub: sub.id });
    return;
  }

  const { data: actual } = await db.from("profiles").select("plan").eq("id", userId).maybeSingle();
  const anterior = ((actual?.plan as Plan | undefined) ?? "ninguno") as Plan;

  // Cancelación pedida: sigue siendo del plan que pagó hasta que venza.
  if (sub.cancel_at_period_end) {
    await db
      .from("profiles")
      .update({ plan_pending: "ninguno", plan_effective_at: finPeriodo })
      .eq("id", userId);
    logger.info("webhook stripe: baja programada", { cuando: finPeriodo });
    return;
  }

  // Bajada de plan: se programa para el fin del período, no se aplica hoy.
  if (isDowngrade(anterior, plan) && finPeriodo) {
    await db
      .from("profiles")
      .update({ plan_pending: plan, plan_effective_at: finPeriodo })
      .eq("id", userId);
    logger.info("webhook stripe: bajada programada", { a: plan, cuando: finPeriodo });
    return;
  }

  // Alta o subida: de una.
  await aplicarPlan(userId, plan, { periodEnd: finPeriodo, trialEndsAt: finPrueba });
  logger.info("webhook stripe: plan aplicado", { plan });
}

/**
 * Cumplir un checkout a partir de su `session_id` (el que Stripe pone en la
 * `success_url` como `{CHECKOUT_SESSION_ID}`). Devuelve el plan que quedó
 * aplicado, o null si la sesión no está pagada o no es de este usuario.
 *
 * `userId` es una defensa: un `session_id` es un dato que viaja por la URL, y
 * nadie debería poder activar una cuenta ajena pegando el id de otro checkout.
 * Con trial, Stripe marca `payment_status = "paid"` cuando la factura de $0 de
 * la prueba se procesó; ése es el estado que se acepta.
 */
export async function cumplirCheckout(
  sessionId: string,
  userId: string,
): Promise<{ ok: true; plan: Plan } | { ok: false; motivo: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, motivo: "stripe no configurado" };

  // Un `session_id` inventado o vencido hace que Stripe tire: no es motivo para
  // que la página de bienvenida se caiga, solo para no aplicar nada.
  let sesion: Stripe.Checkout.Session;
  try {
    sesion = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
  } catch (err) {
    return { ok: false, motivo: err instanceof Error ? err.message : "sesión inválida" };
  }
  if (sesion.metadata?.userId !== userId) return { ok: false, motivo: "sesión de otro usuario" };
  if (sesion.payment_status !== "paid")
    return { ok: false, motivo: `payment_status=${sesion.payment_status}` };

  const sub =
    typeof sesion.subscription === "string"
      ? await stripe.subscriptions.retrieve(sesion.subscription)
      : sesion.subscription;
  if (!sub) return { ok: false, motivo: "checkout sin suscripción" };

  await manejarSuscripcion(sub);
  const plan = planDeSuscripcion(sub);
  return plan ? { ok: true, plan } : { ok: false, motivo: "precio sin plan reconocible" };
}
