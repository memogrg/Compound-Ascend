import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { MobileTabBar } from "../components/mobile-tab-bar";
import { ToastProvider } from "../components/form-kit/toast";
import { AppLockOverlay } from "../components/app-lock-overlay";

/**
 * Layout de las pantallas AUTENTICADAS del móvil. Usa la sesión existente
 * (getUser() de @/lib/auth/session, misma cookie que la web) y, si no hay
 * sesión, redirige a /m/login. /m/login queda fuera de este grupo (app), así
 * que no dispara la guarda (evita el bucle de redirección).
 *
 * Añade la tab bar inferior fija; el contenido deja aire para ella con `.m-scroll`.
 */
export default async function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // Sin sesión → la puerta de entrada es /m/login (login real reutilizando Supabase).
  // El modo DEMO (datos de ejemplo sin sesión) queda detrás de una bandera DESACTIVADA
  // por defecto: solo se muestra si MOBILE_DEMO_PREVIEW=1 (previsualización opcional).
  const demoAllowed = process.env.MOBILE_DEMO_PREVIEW === "1";
  if (!user && !demoAllowed) redirect("/m/login");

  return (
    <ToastProvider>
      {/* Candado local con biometría (solo app nativa): se monta primero para tapar
          la UI lo antes posible al reanudar. No afecta a la web. */}
      <AppLockOverlay />
      {children}
      <MobileTabBar />
    </ToastProvider>
  );
}
