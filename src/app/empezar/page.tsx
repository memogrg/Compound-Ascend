import { redirect } from "next/navigation";
import { Empezar } from "@/components/marketing/v3/empezar";
import { getUser } from "@/lib/auth/session";
import { PAID_PLANS, type PaidPlan } from "@/lib/plan";
import { fechaPrimerCobro } from "@/modules/account/services/checkout-service";
import { getEstadoSuscripcion } from "@/modules/account/services/subscription-service";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Probá 14 días gratis — CARTERA+",
  description:
    "Creá tu cuenta, elegí el plan y registrá la tarjeta. Hoy no pagás nada y podés cancelar cuando querás.",
};

function esPlanDePago(v: string | undefined): v is PaidPlan {
  return typeof v === "string" && (PAID_PLANS as readonly string[]).includes(v);
}

/**
 * Paso 1 de 3: la cuenta y el plan.
 *
 * Es pública (está en PUBLIC_PREFIXES del middleware) pero decide según quién
 * llega:
 *  · sin sesión → el formulario de alta con el plan preseleccionado (`?plan=`,
 *    Pro si no viene ninguno: es el que la landing recomienda);
 *  · con sesión y plan vivo → al panel, no hay nada que comprar;
 *  · con sesión y sin plan → modo «reanudar»: la cuenta existe, falta pagar.
 *    Es adonde manda el muro del middleware y el `cancel_url` de Stripe.
 *
 * `?error=pago` lo pone /empezar/pagar cuando Stripe no devolvió checkout.
 */
export default async function EmpezarPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; error?: string; reanudar?: string }>;
}) {
  const { plan, error } = await searchParams;
  const elegido: PaidPlan = esPlanDePago(plan) ? plan : "pro";
  const errorPago = error === "pago";

  const user = await getUser();
  let reanudar: { email: string; yaUsoPrueba: boolean } | null = null;
  if (user) {
    const estado = await getEstadoSuscripcion(user.id);
    if (estado.plan !== "ninguno") redirect("/dashboard");
    // Quien ya tuvo prueba (canceló, o se le venció) no vuelve a tener 14 días:
    // /empezar/pagar abre el checkout sin trial y el texto tiene que decirlo.
    reanudar = { email: user.email ?? "tu cuenta", yaUsoPrueba: estado.finDePrueba != null };
  }

  return (
    <Empezar
      plan={elegido}
      fechaCobro={fechaPrimerCobro()}
      errorPago={errorPago}
      reanudar={reanudar}
    />
  );
}
