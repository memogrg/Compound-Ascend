import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { getClientEnv } from "@/lib/env";
import { PAID_PLANS, type PaidPlan } from "@/lib/plan";
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
 *  · sin plan → checkout con `origen: "empezar"`, que vuelve a /bienvenida con
 *    el `session_id`.
 */
export default async function PagarPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const elegido: PaidPlan = esPlanDePago(plan) ? plan : "pro";

  const user = await getUser();
  if (!user) redirect(`/empezar?plan=${elegido}`);

  const estado = await getEstadoSuscripcion(user.id);
  if (estado.plan !== "ninguno") redirect("/dashboard");

  const r = await crearCheckout({
    userId: user.id,
    email: user.email ?? null,
    plan: elegido,
    yaUsoPrueba: estado.finDePrueba != null,
    baseUrl: getClientEnv().NEXT_PUBLIC_APP_URL,
    origen: "empezar",
  });

  if (!r.ok || !r.url) redirect(`/empezar?plan=${elegido}&error=pago`);
  redirect(r.url);
}
