import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { getPrimaryCurrency, getDisplayCurrency } from "@/modules/financial-base";
import { getUserTimezone, knownUserTz } from "@/lib/time/user-time";
import { TimezoneSync } from "@/components/tz/timezone-sync";
import { TimezoneProvider } from "@/components/tz/timezone-context";
import { CurrencyProvider } from "@/components/layout/currency-context";
import { ToastProvider } from "../components/form-kit/toast";
import { AppLockOverlay } from "../components/app-lock-overlay";
import { WidgetSnapshotWriter } from "../components/widget-snapshot-writer";
import { MobileRhythmNudge } from "../components/mobile-rhythm-nudge";

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
 *
 * Monta CurrencyProvider (igual que el shell web), con las DOS monedas: la principal
 * —estable, la que se usa para CAPTURAR un importe libre— y la de visualización del topbar.
 * Antes no lo montaba, así que los formularios de alta sembraban su moneda de la de
 * visualización y `useCaptureCurrency()` caía al fallback "CRC". Con el provider aquí, cada
 * formulario lee la principal del contexto y deja de heredar la volátil.
 */
export default async function MobileAppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // Sin sesión → la puerta de entrada es /m/login (login real reutilizando Supabase).
  // El modo DEMO (datos de ejemplo sin sesión) queda detrás de una bandera DESACTIVADA
  // por defecto: solo se muestra si MOBILE_DEMO_PREVIEW=1 (previsualización opcional).
  const demoAllowed = process.env.MOBILE_DEMO_PREVIEW === "1";
  if (!user && !demoAllowed) redirect("/m/login");

  // Sin sesión (modo demo) no se consultan monedas del usuario: CRC/CRC de relleno. Con
  // sesión, las dos reales; best-effort para no tumbar el layout si el fetch falla.
  let currencies = { primary: "CRC", display: "CRC" };
  let savedTz: string | null = null;
  // Zona EFECTIVA (cookie → perfil) para las capturas del cliente; null = sin capturar aún.
  let knownTz: string | null = null;
  if (user) {
    const [primary, display, tz, effectiveTz] = await Promise.all([
      getPrimaryCurrency().catch(() => "CRC"),
      getDisplayCurrency().catch(() => "CRC"),
      getUserTimezone().catch(() => null),
      knownUserTz().catch(() => null),
    ]);
    currencies = { primary, display };
    savedTz = tz;
    knownTz = effectiveTz;
  }

  return (
    <TimezoneProvider value={knownTz}>
      <CurrencyProvider value={currencies}>
        <ToastProvider>
          {/* Fondo ambiental "Cristal Cálido": halos de marca detrás de todo el contenido.
          Fijo, no interactivo (pointer-events:none) → no afecta scroll ni hit-testing. */}
          <div className="m-ambient" aria-hidden />
          {/* Candado local con biometría (solo app nativa): se monta primero para tapar
          la UI lo antes posible al reanudar. No afecta a la web. */}
          <AppLockOverlay />
          {/* Escribe el snapshot del widget nativo en cada carga (solo app nativa; no-op en web). */}
          <WidgetSnapshotWriter />
          {/* Captura silenciosa de la zona horaria del dispositivo (una vez, si no hay guardada). */}
          <TimezoneSync savedTz={savedTz} />
          {/* Ritmo del mes: ventana de configuración, cierre y recordatorio de registro.
          Un aviso a la vez, descartable, y se auto-oculta cuando no hay nada que decir. */}
          <MobileRhythmNudge />
          {children}
        </ToastProvider>
      </CurrencyProvider>
    </TimezoneProvider>
  );
}
