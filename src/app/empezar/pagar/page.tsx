import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { getClientEnv } from "@/lib/env";
import { PAID_PLANS, esPeriodo, type PaidPlan, type Periodo } from "@/lib/plan";
import { getEstadoSuscripcion } from "@/modules/account/services/subscription-service";
import { crearCheckout } from "@/modules/account/services/checkout-service";

export const dynamic = "force-dynamic";

function esPlanDePago(v: string | undefined): v is PaidPlan {
  return typeof v === "string" && (PAID_PLANS as readonly string[]).includes(v);
}

/**
 * Paso 2 de 3: abrir el pago. No tiene interfaz: decide y redirige.
 *
 * Es UNA sola puerta hacia Stripe para tres caminos distintos — el alta con
 * contraseña, el alta con Google (que vuelve acá por `next`) y «Reanudar pago»
 * de quien abandonó el checkout— para que la regla de «¿esta persona debe ir a
 * pagar?» viva en un solo lugar:
 *
 *  · sin sesión → a /empezar con el plan, que es donde se crea la cuenta;
 *  · con plan vivo → al panel: no se le abre otro checkout a quien ya paga
 *    (docs.stripe.com/payments/checkout/limit-subscriptions);
 *  · con suscripción de tienda (App Store / Google Play) → al panel, aunque el plan
 *    todavía no se haya aplicado: esa cuenta paga en la app, no acá;
 *  · sin plan → checkout con `origen: "empezar"`, que vuelve a /bienvenida con
 *    el `session_id`.
 *
 * El período viaja tal cual hasta el checkout (mensual si no viene). Si ese período no tiene
 * precio en Stripe, vuelve a /empezar con `error=precio`: nunca se abre el pago de otro período.
 */
export default async function PagarPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; periodo?: string }>;
}) {
  const { plan, periodo } = await searchParams;
  const elegido: PaidPlan = esPlanDePago(plan) ? plan : "pro";
  const cada: Periodo = esPeriodo(periodo) ? periodo : "mensual";
  const volver = `/empezar?plan=${elegido}&periodo=${cada}`;

  const user = await getUser();
  if (!user) redirect(volver);

  const estado = await getEstadoSuscripcion(user.id);
  if (estado.plan !== "ninguno" || estado.origen === "store") redirect("/dashboard");

  const r = await crearCheckout({
    userId: user.id,
    email: user.email ?? null,
    plan: elegido,
    periodo: cada,
    yaUsoPrueba: estado.finDePrueba != null,
    baseUrl: getClientEnv().NEXT_PUBLIC_APP_URL,
    origen: "empezar",
  });

  if (r.motivo === "precio_no_disponible") redirect(`${volver}&error=precio`);
  if (!r.ok || !r.url) redirect(`${volver}&error=pago`);
  redirect(r.url);
}
