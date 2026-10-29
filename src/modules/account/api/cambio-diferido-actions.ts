"use server";

/**
 * Anota un cambio de producto DIFERIDO que la app acaba de pedirle a la tienda.
 *
 * RevenueCat no entrega el PRODUCT_CHANGE de un reemplazo DEFERRED de Google Play: lo marca
 * como «historical change» y el webhook nunca se entera (evento 8207c272… en sandbox). Sin
 * esto, `store_product_pending` y `plan_pending` quedan vacíos: /m/perfil/plan deja pedir un
 * segundo cambio que Play rechaza, y la cuenta no dice «Cambia a …».
 *
 * La app llama acá cuando la compra con DEFERRED vuelve bien. Escribe lo mismo que el webhook
 * escribiría con el PRODUCT_CHANGE, y la compra o renovación que confirma el cambio lo promueve
 * igual que siempre. Usa service-role como el webhook: el trigger protect_profile_store_billing
 * no deja a la sesión tocar las columnas de tienda. Por eso valida todo antes de escribir; lo
 * peor que alguien puede hacer llamándola a mano es programarse su propia bajada.
 *
 * Idempotente: repetirla con el mismo producto escribe los mismos valores.
 */
import { getUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { isDowngrade } from "@/lib/plan";
import { cambioDiferido, productoDeTienda } from "@/lib/billing/store-products";
import {
  getEstadoSuscripcion,
  programarBajada,
} from "@/modules/account/services/subscription-service";

export async function registrarCambioDiferido(productoNuevo: string): Promise<{ ok: boolean }> {
  const user = await getUser();
  if (!user) {
    logger.warn("cambio diferido: sin sesión");
    return { ok: false };
  }

  const estado = await getEstadoSuscripcion(user.id);
  if (estado.origen !== "store") {
    logger.warn("cambio diferido: el plan no viene de la tienda", { origen: estado.origen });
    return { ok: false };
  }
  const nuevo = productoDeTienda(productoNuevo);
  if (!nuevo) {
    logger.warn("cambio diferido: producto desconocido", { producto: productoNuevo });
    return { ok: false };
  }

  const db = createServiceRoleClient();
  const { data } = await db
    .from("profiles")
    .select("store_product_id")
    .eq("id", user.id)
    .maybeSingle();
  const actual = (data?.store_product_id as string | null | undefined) ?? null;
  if (!cambioDiferido(actual, productoNuevo)) {
    logger.warn("cambio diferido: el cambio no es diferido", {
      actual,
      producto: productoNuevo,
    });
    return { ok: false };
  }

  // Bajar de plan, además, se programa para cuando vence lo pagado: lo cobra la tienda recién
  // al renovar, igual que en el webhook. El mismo plan con otro período no toca el plan. Va
  // primero: si no hay fecha de fin, no se anota nada.
  if (isDowngrade(estado.plan, nuevo.plan)) {
    const r = await programarBajada(user.id, nuevo.plan, estado.tienda?.finDePeriodo ?? null);
    if (!r.ok) {
      logger.warn("cambio diferido: no se pudo programar la bajada", { a: nuevo.plan });
      return { ok: false };
    }
  }

  const { error } = await db
    .from("profiles")
    .update({ store_product_pending: productoNuevo })
    .eq("id", user.id);
  if (error) {
    logger.error("cambio diferido: no se pudo anotar", { message: error.message });
    return { ok: false };
  }
  logger.info("cambio diferido anotado", { producto: productoNuevo });
  return { ok: true };
}
