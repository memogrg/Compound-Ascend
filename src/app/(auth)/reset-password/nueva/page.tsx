import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/reset-form";

export const metadata = { title: "Nueva contraseña — Compound Ascend" };

/**
 * Destino del enlace de restablecimiento. El callback ya intercambió el código
 * por una sesión temporal, por lo que el usuario puede fijar su nueva contraseña.
 */
export default function NewPasswordPage() {
  return (
    <AuthShell
      titleHTML='Crea tu <span class="it">nueva contraseña</span>'
      subtitle="Elige una contraseña segura. Después te llevaremos a tu panel."
      showTrust={false}
    >
      <UpdatePasswordForm />
    </AuthShell>
  );
}
