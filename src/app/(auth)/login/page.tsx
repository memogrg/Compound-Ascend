import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Iniciar sesión — Compound Ascend" };

export default function LoginPage() {
  return (
    <AuthShell
      titleHTML='Bienvenido de <span class="it">vuelta</span>'
      subtitle="Tu asesor financiero personal te está esperando. Continúa donde lo dejaste."
      footer={
        <>
          ¿No tienes cuenta? <Link href="/signup">Crea una</Link>
        </>
      }
    >
      <GoogleButton />
      <div className="auth-divider">o con tu correo</div>
      <LoginForm />
    </AuthShell>
  );
}
