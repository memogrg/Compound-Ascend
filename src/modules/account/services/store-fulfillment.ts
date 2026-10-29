import "server-only";

/**
 * CUMPLIMIENTO de una suscripción de tienda (App Store / Google Play) a partir de un evento
 * del webhook de RevenueCat. Es el espejo de `stripe-fulfillment.ts`: la ÚNICA función que
 * cambia `profiles.plan` desde la tienda, con service-role y con el mismo `aplicarPlan`, así
 * que la orfandad del hogar corre igual venga el pago de donde venga.
 *
 * Las reglas:
 *  · Compra, renovación, reactivación y extensión → se aplica el plan del producto.
 *  · Cambio de producto DIFERIDO (a un plan menor, o al mismo plan con otro período) → no
 *    está vigente hasta que vence lo pagado: `store_product_id` queda con el vigente y el
 *    nuevo espera en `store_product_pending`. Si es un plan menor, además se programa la
 *    bajada, como en Stripe. La compra o renovación que lo confirma lo promueve y limpia.
 *  · Cancelación → NO se corta hoy: se programa `ninguno` para cuando vence lo pagado.
 *  · Vencimiento → se apaga la suscripción de tienda y, si era ella la que daba el plan,
 *    la cuenta pasa a `ninguno`.
 *  · Si la cuenta paga por Stripe, la tienda NO le toca el plan («doble canal»): se anota la
 *    compra y se avisa en el log. La regla espejo vive en `manejarSuscripcion`.
 *
 * Un evento que no se puede mapear a un plan nuestro no toca la cuenta.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { isDowngrade, type Plan } from "@/lib/plan";
import {
  cambioDiferido,
  planDeEntitlements,
  planDeProducto,
  productoDeTienda,
} from "@/lib/billing/store-products";
import { origenDeSuscripcion } from "@/lib/billing/subscription-source";
import { aplicarPlan, programarBajada } from "@/modules/account/services/subscription-service";

/** El evento de RevenueCat, ya validado por la ruta (solo los campos que usamos). */
export type EventoTienda = {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  product_id?: string | null;
  new_product_id?: string | null;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  store?: string | null;
  environment?: string | null;
  period_type?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
};

export type ResultadoTienda = {
  status: "applied" | "scheduled" | "updated" | "ignored" | "ok";
  motivo?: string;
};

/** Los eventos que dan (o confirman) acceso al plan del producto. */
const DAN_ACCESO = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PerfilTienda = {
  id: string;
  plan: Plan;
  stripe_subscription_id: string | null;
  store_subscription_active: boolean;
  store_platform: "ios" | "android" | null;
  store_product_id: string | null;
  store_product_pending: string | null;
  store_period_end: string | null;
  revenuecat_app_user_id: string | null;
};

const COLUMNAS =
  "id, plan, stripe_subscription_id, store_subscription_active, store_platform, store_product_id, store_product_pending, store_period_end, revenuecat_app_user_id";

export function plataformaDe(store: string | null | undefined): "ios" | "android" | null {
  if (store === "APP_STORE" || store === "MAC_APP_STORE") return "ios";
  if (store === "PLAY_STORE") return "android";
  return null;
}

function aIso(ms: number | null | undefined): string | null {
  return typeof ms === "number" && Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

async function perfil(userId: string): Promise<PerfilTienda | null> {
  const { data } = await createServiceRoleClient()
    .from("profiles")
    .select(COLUMNAS)
    .eq("id", userId)
    .maybeSingle();
  return (data as PerfilTienda | null) ?? null;
}

/**
 * De un id de RevenueCat a nuestra cuenta. La app configura RevenueCat con el UUID de la
 * cuenta como `app_user_id`; si llega un id anónimo (`$RCAnonymousID:…`) se busca por el
 * `original_app_user_id` que se guardó en una compra anterior.
 */
export async function usuarioDeTienda(
  appUserId: string | null | undefined,
  originalAppUserId?: string | null,
): Promise<string | null> {
  if (appUserId && UUID.test(appUserId)) return appUserId;
  const buscado = originalAppUserId ?? appUserId;
  if (!buscado) return null;
  const { data } = await createServiceRoleClient()
    .from("profiles")
    .select("id")
    .eq("revenuecat_app_user_id", buscado)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function manejarEventoTienda(
  ev: EventoTienda,
  userId: string,
): Promise<ResultadoTienda> {
  const db = createServiceRoleClient();
  const fin = aIso(ev.expiration_at_ms);
  const actual = await perfil(userId);
  if (!actual) {
    logger.warn("webhook revenuecat: cuenta sin perfil", { tipo: ev.type });
    return { status: "ignored", motivo: "sin perfil" };
  }
  const origen = origenDeSuscripcion(actual);

  if (DAN_ACCESO.has(ev.type)) {
    const producto = ev.new_product_id ?? ev.product_id ?? null;
    const plan = planDeProducto(producto) ?? planDeEntitlements(ev.entitlement_ids);
    if (!plan) {
      logger.warn("webhook revenuecat: producto sin plan reconocible", {
        tipo: ev.type,
        producto,
      });
      return { status: "ignored", motivo: "producto desconocido" };
    }

    if (ev.type === "PRODUCT_CHANGE" && producto && !productoDeTienda(actual.store_product_id)) {
      logger.warn("webhook revenuecat: cambio de producto sin producto actual reconocible", {
        actual: actual.store_product_id,
        nuevo: producto,
      });
    }
    // Un PRODUCT_CHANGE diferido es solo un aviso: la tienda sigue cobrando el producto de hoy
    // hasta que vence lo pagado. El vigente no se toca; el nuevo queda pendiente.
    const diferido =
      ev.type === "PRODUCT_CHANGE" &&
      producto !== null &&
      cambioDiferido(actual.store_product_id, producto);

    const cuenta = {
      store_subscription_active: true,
      store_platform: plataformaDe(ev.store) ?? actual.store_platform,
      revenuecat_app_user_id:
        ev.original_app_user_id ?? actual.revenuecat_app_user_id ?? ev.app_user_id ?? null,
    };
    await db
      .from("profiles")
      .update(
        diferido
          ? {
              ...cuenta,
              store_product_pending: producto,
              ...(fin ? { store_period_end: fin } : {}),
            }
          : // Compra, renovación o subida: este producto es el vigente, y un cambio diferido
            // que esperaba ya entró (o se descartó).
            // Caso conocido, aceptado: si el pedido diferido llega segundos antes de una
            // renovación que todavía trae el producto viejo, el cambio entra el ciclo siguiente
            // pero acá el pendiente se pierde. El plan queda correcto (lo aplica la compra que
            // confirma el cambio) y un segundo cambio en ese ciclo cae en CAMBIO_RECHAZADO.
            {
              ...cuenta,
              store_product_id: producto,
              store_product_pending: null,
              store_period_end: fin,
            },
      )
      .eq("id", userId);

    if (origen === "stripe") {
      logger.warn("webhook revenuecat: doble canal, la cuenta ya paga por Stripe", {
        tipo: ev.type,
        plan,
      });
      return { status: "ignored", motivo: "doble canal" };
    }

    // El cambio a un plan menor lo cobra la tienda recién al renovar: hasta entonces sigue
    // en el plan que pagó (la misma regla que Stripe). La compra o renovación con el producto
    // nuevo lo aplica cuando llega. El mismo plan con otro período no toca el plan.
    if (diferido && !isDowngrade(actual.plan, plan)) {
      logger.info("webhook revenuecat: cambio de período programado", { producto });
      return { status: "scheduled" };
    }
    if (ev.type === "PRODUCT_CHANGE" && isDowngrade(actual.plan, plan)) {
      const r = await programarBajada(userId, plan, fin);
      logger.info("webhook revenuecat: bajada programada", { a: plan, cuando: r.cambiaEl });
      return r.ok ? { status: "scheduled" } : { status: "ignored", motivo: r.message };
    }

    await aplicarPlan(userId, plan);
    logger.info("webhook revenuecat: plan aplicado", { tipo: ev.type, plan });
    return { status: "applied" };
  }

  switch (ev.type) {
    case "CANCELLATION": {
      // Sin renovación no entra ningún cambio diferido.
      await db
        .from("profiles")
        .update({ store_product_pending: null, ...(fin ? { store_period_end: fin } : {}) })
        .eq("id", userId);
      if (origen !== "store") return { status: "ignored", motivo: "el plan no viene de la tienda" };
      const r = await programarBajada(userId, "ninguno", fin ?? actual.store_period_end);
      logger.info("webhook revenuecat: baja programada", { cuando: r.cambiaEl });
      return r.ok ? { status: "scheduled" } : { status: "ignored", motivo: r.message };
    }

    case "EXPIRATION": {
      await db
        .from("profiles")
        .update({
          store_subscription_active: false,
          store_product_pending: null,
          store_period_end: fin ?? actual.store_period_end,
        })
        .eq("id", userId);
      if (origen !== "store") {
        logger.info("webhook revenuecat: vencimiento sin efecto en el plan", { origen });
        return { status: "updated" };
      }
      await aplicarPlan(userId, "ninguno");
      logger.info("webhook revenuecat: cuenta sin plan");
      return { status: "applied" };
    }

    case "BILLING_ISSUE": {
      logger.warn("webhook revenuecat: problema de cobro en la tienda", { cuando: fin });
      if (fin) await db.from("profiles").update({ store_period_end: fin }).eq("id", userId);
      return { status: "updated" };
    }

    default:
      return { status: "ignored", motivo: `tipo ${ev.type}` };
  }
}

/**
 * TRANSFER: la compra pasó de una cuenta de RevenueCat a otra (la persona restauró
 * compras con otra cuenta). Se mueven las columnas de tienda; el origen queda sin plan
 * SOLO si su plan venía de la tienda, y el destino recibe el plan del producto salvo que
 * ya pague por Stripe.
 */
export async function transferirTienda(ev: EventoTienda): Promise<ResultadoTienda> {
  const desdeId = await usuarioDeTienda(ev.transferred_from?.[0] ?? null);
  const haciaId = await usuarioDeTienda(ev.transferred_to?.[0] ?? null);
  if (!desdeId || !haciaId || desdeId === haciaId) {
    logger.warn("webhook revenuecat: transferencia sin cuentas reconocibles", {
      desde: Boolean(desdeId),
      hacia: Boolean(haciaId),
    });
    return { status: "ignored", motivo: "transferencia sin cuentas" };
  }

  const desde = await perfil(desdeId);
  const hacia = await perfil(haciaId);
  if (!desde || !hacia) return { status: "ignored", motivo: "sin perfil" };

  const db = createServiceRoleClient();
  const origenDesde = origenDeSuscripcion(desde);
  const origenHacia = origenDeSuscripcion(hacia);

  // Primero se libera el origen: `revenuecat_app_user_id` es único.
  await db
    .from("profiles")
    .update({
      store_subscription_active: false,
      store_platform: null,
      store_product_id: null,
      store_product_pending: null,
      store_period_end: null,
      revenuecat_app_user_id: null,
    })
    .eq("id", desdeId);
  await db
    .from("profiles")
    .update({
      store_subscription_active: desde.store_subscription_active,
      store_platform: desde.store_platform,
      store_product_id: desde.store_product_id,
      store_product_pending: desde.store_product_pending,
      store_period_end: desde.store_period_end,
      revenuecat_app_user_id: ev.transferred_to?.[0] ?? desde.revenuecat_app_user_id,
    })
    .eq("id", haciaId);

  if (origenDesde === "store") await aplicarPlan(desdeId, "ninguno");

  const plan = planDeProducto(desde.store_product_id);
  if (desde.store_subscription_active && plan && origenHacia !== "stripe") {
    await aplicarPlan(haciaId, plan);
  }
  logger.info("webhook revenuecat: transferencia aplicada", { plan });
  return { status: "applied" };
}
