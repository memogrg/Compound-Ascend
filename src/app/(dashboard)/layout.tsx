import { AppShell } from "@/components/layout/app-shell";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import {
  getDisplayCurrency,
  getPrimaryCurrency,
} from "@/modules/financial-base/services/base-service";

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

  // Monedas para el switch de visualización del topbar (best-effort).
  let currency = { display: "CRC", primary: "CRC" };
  if (isSupabaseConfigured() && user) {
    try {
      const [display, primary] = await Promise.all([getDisplayCurrency(), getPrimaryCurrency()]);
      currency = { display, primary };
    } catch {
      // sin perfil aún: se mantiene el valor por defecto
    }
  }

  return (
    <AppShell user={{ name, sub, initials }} currency={currency}>
      {children}
    </AppShell>
  );
}
