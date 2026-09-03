import "server-only";

/**
 * Checkout y portal de facturación.
 *
 * La regla del negocio: la tarjeta se registra AL ABRIR LA CUENTA, no se cobra
 * durante los 14 días, y el primer cargo cae al vencer la prueba. En Stripe eso
 * es `trial_period_days` + `payment_method_collection: "always"` — sin lo
 * segundo, Stripe deja pasar la prueba sin pedir tarjeta y el día 15 no hay con
 * qué cobrar.
 *
 * Claude nunca ve ni maneja los datos de la tarjeta: los pide Stripe en su
 * propio dominio y nosotros solo recibimos el resultado por webhook.
 */
import { getStripe, precioDe } from "@/lib/billing/stripe";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { TRIAL_DAYS, type PaidPlan } from "@/lib/plan";

/** Cliente de Stripe de este usuario; lo crea la primera vez y lo guarda. */
async function clienteDe(userId: string, email: string | null): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe no está configurado.");
  const db = createServiceRoleClient();

  const { data } = await db
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();
  const existente = data?.stripe_customer_id as string | null | undefined;
  if (existente) return existente;

  // `metadata.userId` es el hilo que permite volver del evento de Stripe a la
  // cuenta nuestra sin depender del correo (que el usuario puede cambiar).
  const cliente = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { userId },
  });
  await db.from("profiles").update({ stripe_customer_id: cliente.id }).eq("id", userId);
  return cliente.id;
}

/**
 * Sesión de checkout para suscribirse o subir de plan.
 * Devuelve la URL a la que hay que mandar al usuario.
 */
/** Fecha del primer cobro si la prueba empieza hoy, en español de Costa Rica. */
export function fechaPrimerCobro(desde: Date = new Date()): string {
  const d = new Date(desde);
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "long" });
}

export async function crearCheckout(input: {
  userId: string;
  email: string | null;
  plan: PaidPlan;
  /** Ya usó la prueba antes: no se le regala otra. */
  yaUsoPrueba: boolean;
  baseUrl: string;
  /**
   * De dónde viene la persona. Decide a dónde vuelve:
   *  · `empezar` — alta desde la web: al terminar va a /bienvenida con el
   *    `session_id`, que la página usa para CUMPLIR el checkout por su cuenta
   *    sin depender de que el webhook haya llegado; si cancela, vuelve a
   *    /empezar con su plan y la cuenta ya creada («Reanudar pago»).
   *  · `suscripcion` — cambio de plan desde adentro: vuelve a /suscripcion.
   */
  origen?: "empezar" | "suscripcion";
}): Promise<{ ok: boolean; url?: string; message?: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, message: "El cobro todavía no está habilitado." };

  const origen = input.origen ?? "suscripcion";
  const vuelta =
    origen === "empezar"
      ? {
          // `{CHECKOUT_SESSION_ID}` es literal: Stripe lo sustituye al redirigir.
          success_url: `${input.baseUrl}/bienvenida?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${input.baseUrl}/empezar?plan=${input.plan}&reanudar=1`,
        }
      : {
          success_url: `${input.baseUrl}/suscripcion?listo=1`,
          cancel_url: `${input.baseUrl}/suscripcion?cancelado=1`,
        };

  // Lo que la persona más teme no es el precio: es olvidarse de cancelar y que le
  // cobren. Decirlo con fecha exacta al lado del botón de pago es lo que en el caso
  // Blinkist subió los inicios de prueba 23 % y bajó las quejas 55 %.
  const aviso = input.yaUsoPrueba
    ? "Tu suscripción empieza hoy. Podés cancelarla cuando querás desde Configuración."
    : `Hoy no pagás nada. Tu primer cobro sería el ${fechaPrimerCobro()}; te avisamos por correo antes, y cancelás en un clic desde Configuración.`;

  try {
    const customer = await clienteDe(input.userId, input.email);
    const price = await precioDe(input.plan);

    const sesion = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity: 1 }],
      // Sin esto, Stripe omite la tarjeta cuando hay prueba y el día 15 no hay
      // método de pago: la suscripción se cae sola.
      payment_method_collection: "always",
      subscription_data: {
        ...(input.yaUsoPrueba ? {} : { trial_period_days: TRIAL_DAYS }),
        metadata: { userId: input.userId, plan: input.plan },
      },
      metadata: { userId: input.userId, plan: input.plan },
      // Sin `locale`, Stripe elige el idioma por el navegador y a buena parte de
      // Costa Rica le salía el checkout en inglés. `es-419` es el español de
      // Latinoamérica.
      locale: "es-419",
      custom_text: { submit: { message: aviso } },
      // Si la sesión expira sin pagar (24 h), Stripe manda el evento
      // `checkout.session.expired` con una URL de recuperación que recrea la
      // sesión; vale 30 días. Es la base del correo «te quedó el pago a medias».
      after_expiration: { recovery: { enabled: true } },
      ...vuelta,
      allow_promotion_codes: true,
    });

    if (!sesion.url) return { ok: false, message: "Stripe no devolvió una URL de pago." };
    return { ok: true, url: sesion.url };
  } catch (err) {
    logger.error("crearCheckout falló", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos abrir el pago. Intentá de nuevo." };
  }
}

/**
 * Portal de facturación de Stripe: cambiar tarjeta, ver facturas, cancelar.
 * Cancelar desde acá deja `cancel_at_period_end` y el webhook programa la
 * bajada a `ninguno` para el fin del período — la misma regla de siempre.
 */
export async function crearPortal(input: {
  userId: string;
  baseUrl: string;
}): Promise<{ ok: boolean; url?: string; message?: string }> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, message: "El cobro todavía no está habilitado." };

  const db = createServiceRoleClient();
  const { data } = await db
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", input.userId)
    .maybeSingle();
  const customer = data?.stripe_customer_id as string | null | undefined;
  if (!customer) return { ok: false, message: "Todavía no tenés una suscripción." };

  try {
    const sesion = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${input.baseUrl}/suscripcion`,
    });
    return { ok: true, url: sesion.url };
  } catch (err) {
    logger.error("crearPortal falló", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos abrir la facturación." };
  }
}
