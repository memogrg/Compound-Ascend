import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";
import { PAID_PLANS, PLAN_LABEL, PLAN_PRICE_USD, TRIAL_DAYS, type PaidPlan } from "@/lib/plan";

export const metadata = { title: "Crear cuenta — CARTERA+" };

function esPlanDePago(v: string | undefined): v is PaidPlan {
  return typeof v === "string" && (PAID_PLANS as readonly string[]).includes(v);
}

/**
 * Registro. Acepta `?plan=` para no perder el plan que la persona eligió en la
 * landing: viaja hasta el pago pasando por la confirmación de correo.
 *
 * El orden es cuenta → tarjeta, no al revés. Cobrar antes de que exista la
 * cuenta deja pagos huérfanos —plata cobrada sin cuenta a la que asociarla— y
 * ni siquiera ahorra un paso: Stripe recoge el correo pero no puede crear una
 * contraseña, así que la segunda pantalla existe igual, solo que después del
 * dinero, que es donde más gente se cae.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string; plan?: string }>;
}) {
  const { email, next, plan } = await searchParams;
  const elegido = esPlanDePago(plan) ? plan : null;

  // Adónde va la persona al confirmar el correo. Con plan elegido, directo a
  // pagar ese plan; sin plan, al selector, que es lo que ya hacía el muro.
  const destino = next ?? (elegido ? `/suscripcion?plan=${elegido}` : undefined);

  const loginHref = destino ? `/login?next=${encodeURIComponent(destino)}` : "/login";

  return (
    <AuthShell
      titleHTML='Construye tu <span class="it">Rich Life</span>'
      subtitle="Crea tu cuenta y empieza a ordenar, hacer crecer y proteger tu dinero con un asesor con IA."
      footer={
        <>
          ¿Ya tienes cuenta? <Link href={loginHref}>Inicia sesión</Link>
        </>
      }
    >
      {elegido ? (
        <p className="auth-plan">
          Empezás con <strong>{PLAN_LABEL[elegido]}</strong> · ${PLAN_PRICE_USD[elegido]}/mes ·{" "}
          {TRIAL_DAYS} días sin cobro
        </p>
      ) : null}
      <GoogleButton />
      <div className="auth-divider">o con tu correo</div>
      <SignupForm defaultEmail={email} next={destino} />
    </AuthShell>
  );
}
