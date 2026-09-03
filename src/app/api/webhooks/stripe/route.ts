/**
 * POST /api/webhooks/stripe — la ÚNICA vía por la que cambia `profiles.plan`.
 *
 * El cliente no puede tocar su plan ni su facturación: el trigger
 * `protect_profile_plan` se lo bloquea al rol `authenticated`. Acá se verifica
 * la firma de Stripe con `STRIPE_WEBHOOK_SECRET` sobre el cuerpo CRUDO —si se
 * parsea el JSON antes, la firma no valida nunca— y se escribe con service-role.
 *
 * Las reglas de negocio (alta, subida, bajada programada, cancelación, orfandad)
 * viven en `stripe-fulfillment.ts`, compartidas con la página de bienvenida, que
 * cumple el checkout por su cuenta cuando la persona vuelve de Stripe antes de que
 * llegue el evento.
 */
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { toSafeResponse, AppError } from "@/lib/errors";
import { alreadyProcessed } from "@/lib/security/idempotency";
import { getStripe } from "@/lib/billing/stripe";
import { manejarSuscripcion } from "@/modules/account/services/stripe-fulfillment";

export const runtime = "nodejs";

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
