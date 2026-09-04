import "server-only";

/**
 * El correo que confirma el alta: qué plan, cuánto se cobra, cuándo, y cómo
 * cancelar. Es la mitad del cumplimiento con las redes de tarjetas para
 * pruebas gratis (la otra mitad, el recordatorio del día 7, lo manda Stripe
 * desde Configuración → Suscripciones y correos); y es lo que la persona
 * espera recibir un minuto después de registrar la tarjeta.
 *
 * Se manda UNA vez por checkout: lo llaman tanto /bienvenida (al volver de
 * Stripe) como el webhook `checkout.session.completed`, y el primero que
 * llegue gana por la tabla processed_events.
 */
import type Stripe from "stripe";
import { sendEmail, isEmailConfigured } from "@/lib/email/send";
import { getClientEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { PAID_PLANS, PLAN_LABEL, type PaidPlan } from "@/lib/plan";
import { alreadyProcessed } from "@/lib/security/idempotency";
import { escapeHtml } from "@/lib/security/escape-html";
import { planDeSuscripcion } from "@/lib/billing/stripe";

function fecha(epoch: number | null | undefined): string | null {
  if (!epoch) return null;
  return new Date(epoch * 1000).toLocaleDateString("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function monto(sub: Stripe.Subscription): string | null {
  const price = sub.items?.data?.[0]?.price;
  if (!price || price.unit_amount == null) return null;
  const moneda = price.currency.toUpperCase();
  const valor = price.unit_amount / 100;
  // Dólares con punto decimal («$34.00»), como los muestra Stripe y la landing;
  // colones sin decimales y con separador de miles local.
  if (moneda === "USD") return `$${valor.toFixed(2)}`;
  const n = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 }).format(valor);
  return `${moneda} ${n}`;
}

/** Cuerpo del correo. Exportado para probarlo sin mandar nada. */
export function htmlBienvenida(input: {
  plan: PaidPlan;
  enPrueba: boolean;
  primerCobro: string | null;
  monto: string | null;
  urlSuscripcion: string;
  urlApp: string;
}): { subject: string; html: string } {
  const nombre = escapeHtml(PLAN_LABEL[input.plan]);
  const precio = input.monto ? `${escapeHtml(input.monto)} al mes` : "el precio de tu plan";
  const cuando = input.primerCobro ? escapeHtml(input.primerCobro) : "al terminar la prueba";

  const subject = input.enPrueba
    ? `Tu prueba de CARTERA+ ${PLAN_LABEL[input.plan]} empezó · hoy no pagás nada`
    : `Tu suscripción a CARTERA+ ${PLAN_LABEL[input.plan]} está activa`;

  const cobro = input.enPrueba
    ? `<p style="margin:0 0 14px">Hoy registraste la tarjeta y <strong>no pagaste nada</strong>. ` +
      `El primer cobro sería el <strong>${cuando}</strong> por <strong>${precio}</strong>. ` +
      `Siete días antes te mandamos un recordatorio.</p>`
    : `<p style="margin:0 0 14px">El cobro de <strong>${precio}</strong> se hizo hoy y se repite cada mes.</p>`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#1d1d1f;line-height:1.55">` +
    `<p style="margin:0 0 22px;font-weight:700;font-size:16px;letter-spacing:-0.02em">CARTERA<span style="color:#378451">+</span></p>` +
    `<h1 style="margin:0 0 14px;font-size:24px;font-weight:600;letter-spacing:-0.02em">Bienvenido a ${nombre}.</h1>` +
    cobro +
    `<p style="margin:0 0 14px">Si cancelás antes de esa fecha, no se cobra nada. Se cancela en un clic desde ` +
    `<a href="${escapeHtml(input.urlSuscripcion)}" style="color:#2c6e43">Suscripción</a>, sin llamadas ni correos.</p>` +
    `<p style="margin:22px 0 0"><a href="${escapeHtml(input.urlApp)}" style="display:inline-block;background:#378451;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Entrar a CARTERA+</a></p>` +
    `<p style="margin:26px 0 0;color:#8e8e93;font-size:12px">Guardá este correo: es tu comprobante de la fecha y el monto. ` +
    `Nosotros nunca vemos tu tarjeta; la guarda Stripe.</p>` +
    `</div>`;

  return { subject, html };
}

/**
 * Manda el correo si corresponde. Devuelve por qué no, para el log.
 * `sessionId` es la llave de idempotencia: un checkout, un correo.
 */
export async function enviarBienvenidaUnaVez(input: {
  sessionId: string;
  email: string | null | undefined;
  sub: Stripe.Subscription;
}): Promise<{ enviado: boolean; motivo?: string }> {
  const candidato = planDeSuscripcion(input.sub);
  // `isPaidPlan` solo excluye «ninguno»; acá el plan viene de un lookup_key de
  // Stripe y puede ser cualquier cosa, así que se valida contra la lista.
  if (!candidato || !(PAID_PLANS as readonly string[]).includes(candidato)) {
    return { enviado: false, motivo: "sin plan de pago" };
  }
  const plan = candidato as PaidPlan;
  if (!input.email) return { enviado: false, motivo: "sin correo" };
  if (!isEmailConfigured()) return { enviado: false, motivo: "correo no configurado" };
  if (await alreadyProcessed("stripe-bienvenida", input.sessionId)) {
    return { enviado: false, motivo: "ya enviado" };
  }

  const base = getClientEnv().NEXT_PUBLIC_APP_URL;
  const enPrueba = input.sub.status === "trialing" && Boolean(input.sub.trial_end);
  const { subject, html } = htmlBienvenida({
    plan,
    enPrueba,
    primerCobro: fecha(enPrueba ? input.sub.trial_end : null),
    monto: monto(input.sub),
    urlSuscripcion: `${base}/suscripcion`,
    urlApp: `${base}/dashboard`,
  });

  const r = await sendEmail({ to: input.email, subject, html });
  if (!r.ok) {
    logger.warn("bienvenida: correo no enviado", { motivo: r.error ?? "omitido" });
    return { enviado: false, motivo: r.error ?? "omitido" };
  }
  logger.info("bienvenida: correo enviado", { plan });
  return { enviado: true };
}
