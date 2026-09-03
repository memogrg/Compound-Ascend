import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Iniciar sesión — CARTERA+" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Con `next` (una invitación a un hogar, un enlace profundo) el alta sigue
  // siendo /signup, que respeta el destino. Sin destino, quien no tiene cuenta
  // es alguien que viene a probar: va a /empezar, la puerta con plan y pago.
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/empezar";
  return (
    <AuthShell
      titleHTML='Bienvenido de <span class="it">vuelta</span>'
      subtitle="Tu asesor financiero personal te está esperando. Seguí donde lo dejaste."
      footer={
        <>
          ¿No tenés cuenta? <Link href={signupHref}>Probá 14 días gratis</Link>
        </>
      }
    >
      <GoogleButton />
      <div className="auth-divider">o con tu correo</div>
      <LoginForm next={next} />
    </AuthShell>
  );
}
