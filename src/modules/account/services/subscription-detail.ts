import "server-only";

/**
 * Período y fecha de renovación de la suscripción PROPIA, para Ajustes web y /m/perfil.
 *
 * Tienda: sale del perfil (`store_product_id`, `store_period_end`), que escribe el webhook de
 * RevenueCat. Stripe: se lee la suscripción en vivo; no hay columna con el período y no se
 * agrega una (el webhook no cambia). Todo es best-effort: si algo falla devuelve null y la
 * pantalla muestra solo el plan.
 */
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { Plan } from "@/lib/plan";
import { aIso, getStripe, periodoDeSuscripcion } from "@/lib/billing/stripe";
import { origenDeSuscripcion } from "@/lib/billing/subscription-source";
import {
  detalleDeStripe,
  detalleDeTienda,
  fuenteDelDetalle,
  type DetalleSuscripcion,
} from "@/lib/billing/subscription-detail-rules";

export type { DetalleSuscripcion } from "@/lib/billing/subscription-detail-rules";

/** Una lectura de Stripe por request, aunque la pidan varios componentes. */
const leerSuscripcionStripe = cache(async (id: string) => {
  const stripe = getStripe();
  if (!stripe) return null;
  return stripe.subscriptions.retrieve(id);
});

async function detalleStripe(
  subscriptionId: string,
  plan: Plan,
  planPendiente: Plan | null,
): Promise<DetalleSuscripcion | null> {
  const sub = await leerSuscripcionStripe(subscriptionId);
  if (!sub) return null;
  return detalleDeStripe({
    plan,
    plan_pending: planPendiente,
    periodo: periodoDeSuscripcion(sub),
    // En esta versión de la API el fin de período vive en el item, no en la suscripción.
    finDePeriodo: aIso(sub.items?.data?.[0]?.current_period_end),
    cancelaAlFinal: sub.cancel_at_period_end,
  });
}

/**
 * El detalle de la suscripción de quien tiene la sesión, o null si no hay nada que mostrar.
 * `plan` (el propio) y `planEfectivo` son los de `getAccountInfo`, que la pantalla ya leyó.
 */
export async function getDetalleSuscripcion({
  plan,
  planEfectivo,
}: {
  plan: Plan;
  planEfectivo: Plan;
}): Promise<DetalleSuscripcion | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const user = await getUser();
    if (!user) return null;
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("profiles")
      .select(
        "plan_pending, stripe_subscription_id, store_subscription_active, store_product_id, store_period_end",
      )
      .eq("id", user.id)
      .maybeSingle();
    if (!data) return null;

    const origen = origenDeSuscripcion({ ...data, plan });
    const fuente = fuenteDelDetalle({ origen, plan, planEfectivo });
    const planPendiente = (data.plan_pending ?? null) as Plan | null;
    if (fuente === "store") {
      return detalleDeTienda({
        plan,
        store_product_id: data.store_product_id,
        store_period_end: data.store_period_end,
        plan_pending: planPendiente,
      });
    }
    if (fuente === "stripe" && data.stripe_subscription_id) {
      return await detalleStripe(data.stripe_subscription_id, plan, planPendiente);
    }
    return null;
  } catch (err) {
    logger.warn("detalle de suscripción no disponible", {
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}
