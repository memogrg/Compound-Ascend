/**
 * POST /api/webhooks/stripe — la ÚNICA vía por la que cambia `profiles.plan`.
 *
 * El cliente no puede tocar su plan ni su facturación: el trigger
 * `protect_profile_plan` se lo bloquea al rol `authenticated`. Acá se verifica
 * la firma de Stripe con `STRIPE_WEBHOOK_SECRET` sobre el cuerpo CRUDO —si se
 * parsea el JSON antes, la firma no valida nunca— y se escribe con service-role.
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
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { toSafeResponse, AppError } from "@/lib/errors";
import { alreadyProcessed } from "@/lib/security/idempotency";
import { getStripe, planDeSuscripcion, suscripcionDaAcceso, aIso } from "@/lib/billing/stripe";
import { aplicarPlan } from "@/modules/account/services/subscription-service";
import { isDowngrade, type Plan } from "@/lib/plan";

export const runtime = "nodejs";

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

async function manejarSuscripcion(sub: Stripe.Subscription): Promise<void> {
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

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(`webhook:stripe:${clientIp(req)}`, RATE_LIMITS.webhook);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !secret) {
      throw new AppError("INTERNAL", undefined, "Stripe no configurado en este entorno");
    }

    // CRUDO: la firma se calcula sobre estos bytes exactos.
    const raw = await req.text();
    const firma = req.headers.get("stripe-signature");
    if (!firma) throw new AppError("FORBIDDEN", "Falta la firma.");

    let evento: Stripe.Event;
    try {
      evento = stripe.webhooks.constructEvent(raw, firma, secret);
    } catch {
      logger.warn("webhook stripe: firma inválida");
      throw new AppError("FORBIDDEN", "Firma inválida.");
    }

    // Stripe reintenta; un reintento no puede volver a aplicar el cambio.
    if (await alreadyProcessed("stripe", evento.id)) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    switch (evento.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await manejarSuscripcion(evento.data.object as Stripe.Subscription);
        break;

      case "checkout.session.completed": {
        // El checkout confirma el alta; el estado real viene en la suscripción.
        const sesion = evento.data.object as Stripe.Checkout.Session;
        const subId =
          typeof sesion.subscription === "string" ? sesion.subscription : sesion.subscription?.id;
        if (subId) await manejarSuscripcion(await stripe.subscriptions.retrieve(subId));
        break;
      }

      default:
        // Los demás eventos no cambian el plan. Se aceptan para que Stripe no reintente.
        break;
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status });
  }
}
