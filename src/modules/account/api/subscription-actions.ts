"use server";

/**
 * Acciones de la página de suscripción.
 *
 * Ninguna toca `profiles.plan`: el plan solo se mueve por el webhook de Stripe o
 * por el cron de cambios vencidos. Acá se abre el checkout, se abre el portal y
 * se programa/cancela una bajada.
 */
import { requireUser } from "@/lib/auth/session";
import { getClientEnv } from "@/lib/env";
import { crearCheckout, crearPortal } from "@/modules/account/services/checkout-service";
import {
  getEstadoSuscripcion,
  programarBajada,
  cancelarBajada,
} from "@/modules/account/services/subscription-service";
import { PAID_PLANS, isDowngrade, type PaidPlan, type Plan } from "@/lib/plan";

export type UrlResult = { ok: boolean; url?: string; message?: string };

function esPlanDePago(v: string): v is PaidPlan {
  return (PAID_PLANS as readonly string[]).includes(v);
}

/**
 * Elegir un plan. Si es una subida (o un alta), abre el checkout de Stripe.
 * Si es una bajada, NO cobra nada: programa el cambio para el fin del período.
 */
export async function elegirPlanAction(destino: string): Promise<UrlResult> {
  if (!esPlanDePago(destino)) return { ok: false, message: "Ese plan no existe." };

  const user = await requireUser();
  const estado = await getEstadoSuscripcion(user.id);

  if (isDowngrade(estado.plan, destino as Plan)) {
    const r = await programarBajada(user.id, destino as Plan);
    return r.ok
      ? { ok: true, message: `Tu plan cambia a ${destino} el ${formatoCorto(r.cambiaEl!)}.` }
      : { ok: false, message: r.message };
  }

  return crearCheckout({
    userId: user.id,
    email: user.email ?? null,
    plan: destino,
    // Ya tuvo prueba si alguna vez se le fijó una fecha de fin.
    yaUsoPrueba: estado.finDePrueba != null,
    baseUrl: getClientEnv().NEXT_PUBLIC_APP_URL,
  });
}

/** Portal de Stripe: tarjeta, facturas y cancelación. */
export async function abrirFacturacionAction(): Promise<UrlResult> {
  const user = await requireUser();
  return crearPortal({ userId: user.id, baseUrl: getClientEnv().NEXT_PUBLIC_APP_URL });
}

/** Se arrepintió de la bajada antes de que entrara. */
export async function cancelarBajadaAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  return cancelarBajada(user.id);
}

function formatoCorto(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
