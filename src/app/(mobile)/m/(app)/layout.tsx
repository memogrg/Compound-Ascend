import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { ToastProvider } from "../components/form-kit/toast";
import { AppLockOverlay } from "../components/app-lock-overlay";
import { WidgetSnapshotWriter } from "../components/widget-snapshot-writer";

/**
 * Layout de las pantallas AUTENTICADAS del móvil. Usa la sesión existente
 * (getUser() de @/lib/auth/session, misma cookie que la web) y, si no hay
 * sesión, redirige a /m/login. /m/login queda fuera de este grupo (app), así
 * que no dispara la guarda (evita el bucle de redirección).
 *
 * Ya NO monta una tab bar. Las cuatro pestañas (Inicio · Portafolio · Patrimonio · Ajustes)
 * duplicaban cuatro de los trece destinos que el menú ☰ del header ya ofrece en TODAS las
 * pantallas, a cambio de 64px de alto fijos. Lo que queda abajo es el botón de crear, que
 * cada pantalla monta con <Fab> y significa "lo que se registra aquí".
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
      {/* Fondo ambiental "Cristal Cálido": halos de marca detrás de todo el contenido.
          Fijo, no interactivo (pointer-events:none) → no afecta scroll ni hit-testing. */}
      <div className="m-ambient" aria-hidden />
      {/* Candado local con biometría (solo app nativa): se monta primero para tapar
          la UI lo antes posible al reanudar. No afecta a la web. */}
      <AppLockOverlay />
      {/* Escribe el snapshot del widget nativo en cada carga (solo app nativa; no-op en web). */}
      <WidgetSnapshotWriter />
      {children}
    </ToastProvider>
  );
}
