import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { GoogleButton } from "@/components/auth/google-button";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata = { title: "Crear cuenta — Compound Ascend" };

export default function SignupPage() {
  return (
    <AuthShell
      titleHTML='Construye tu <span class="it">Rich Life</span>'
      subtitle="Crea tu cuenta y empieza a ordenar, hacer crecer y proteger tu dinero con un asesor con IA."
      footer={
        <>
          ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
        </>
      }
    >
      <GoogleButton />
      <div className="auth-divider">o con tu correo</div>
      <SignupForm />
    </AuthShell>
  );
}
