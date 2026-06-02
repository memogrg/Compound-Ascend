import { AppShell } from "@/components/layout/app-shell";
import { getUser } from "@/lib/auth/session";

/**
 * Layout del área autenticada. Obtiene el usuario (si Supabase está configurado)
 * y lo pasa al cascarón. La protección de ruta la garantiza el middleware.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  const name =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Invitado";
  const sub = user?.email ?? "Configura tu perfil";
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return <AppShell user={{ name, sub, initials }}>{children}</AppShell>;
}
