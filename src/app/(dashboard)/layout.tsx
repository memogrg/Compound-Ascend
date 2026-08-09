import { AppShell } from "@/components/layout/app-shell";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import {
  getDisplayCurrency,
  getPrimaryCurrency,
} from "@/modules/financial-base/services/base-service";
import { getUserTimezone, knownUserTz } from "@/lib/time/user-time";
import { TimezoneSync } from "@/components/tz/timezone-sync";
import { RhythmNudge } from "@/components/layout/rhythm-nudge";

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
  // Zona horaria guardada del usuario (para el capturador silencioso).
  let savedTz: string | null = null;
  // Zona EFECTIVA (cookie → perfil), para que las capturas del cliente fechen "hoy" igual
  // que el servidor. null = todavía no se capturó → el cliente usa la del dispositivo.
  let knownTz: string | null = null;
  // Badge dinámico: stubs de inversión por completar (Fase 3). Best-effort.
  let navBadges: Record<string, number> | undefined;
  if (isSupabaseConfigured() && user) {
    try {
      const [display, primary, tz, effectiveTz] = await Promise.all([
        getDisplayCurrency(),
        getPrimaryCurrency(),
        getUserTimezone(),
        knownUserTz(),
      ]);
      currency = { display, primary };
      savedTz = tz;
      knownTz = effectiveTz;
    } catch {
      // sin perfil aún: se mantiene el valor por defecto
    }
    try {
      const { countPendingHoldings } = await import("@/modules/wealth/services/holdings-service");
      const pending = await countPendingHoldings();
      if (pending > 0) navBadges = { wealth: pending };
    } catch {
      // sin inversiones / sin sesión: sin badge
    }
  }

  return (
    <AppShell
      user={{ name, sub, initials }}
      currency={currency}
      navBadges={navBadges}
      timezone={knownTz}
    >
      <TimezoneSync savedTz={savedTz} />
      {/* Va en el layout, no en cada página: el ritmo del mes acompaña en toda la app.
          Se auto-oculta cuando no hay nada que decir (que es casi siempre). */}
      <RhythmNudge />
      {children}
    </AppShell>
  );
}
