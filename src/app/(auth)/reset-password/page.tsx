import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RequestResetForm } from "@/components/auth/reset-form";

export const metadata = { title: "Restablecer contraseña — Compound Ascend" };

export default function ResetPasswordPage() {
  return (
    <AuthShell
      titleHTML='Restablece tu <span class="it">contraseña</span>'
      subtitle="Ingresa tu correo y te enviaremos un enlace seguro para crear una nueva contraseña."
      footer={
        <>
          ¿La recordaste? <Link href="/login">Volver a iniciar sesión</Link>
        </>
      }
    >
      <RequestResetForm />
    </AuthShell>
  );
}
