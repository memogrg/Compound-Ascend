"use client";

import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { SidebarV2 } from "@/components/layout/sidebar-v2";
import { Topbar } from "@/components/layout/topbar";
import { TopbarV2 } from "@/components/layout/topbar-v2";
import { CommandPalette } from "@/components/layout/command-palette";
import { BottomNav } from "@/components/layout/bottom-nav";
import { CoachPanel } from "@/components/ai/coach-panel";
import { ToastProvider } from "@/components/ui/toast";
import { CurrencyProvider } from "@/components/layout/currency-context";
import { TimezoneProvider } from "@/components/tz/timezone-context";
import { navV2Enabled } from "@/lib/flags";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { cn } from "@/lib/utils";

/** Dónde se recuerda el sidebar colapsado. Por navegador, como pide 03-navigation.md. */
const CLAVE_COLAPSADO = "ca.sidebar.collapsed";

type AppShellProps = {
  children: React.ReactNode;
  user?: { name: string; sub: string; initials: string };
  currency?: { display: string; primary: string };
  /** Conteos dinámicos por id de nav (ej. stubs de inversión por completar). */
  navBadges?: Record<string, number>;
  /** Zona del perfil (cookie → user_settings); null = todavía sin capturar. */
  timezone?: string | null;
  /** Mes del USUARIO ("YYYY-MM"), resuelto en el servidor. Sin `?period=` manda este. */
  defaultPeriod?: string;
};

/** Cascarón principal de la app: sidebar + topbar + contenido + coach + nav móvil. */
export function AppShell({
  children,
  user,
  currency,
  navBadges,
  timezone,
  defaultPeriod,
}: AppShellProps) {
  const [drawer, setDrawer] = useState(false);
  const close = () => setDrawer(false);
  const currencies = currency ?? { display: "CRC", primary: "CRC" };
  const navV2 = navV2Enabled();

  // Solo bajo bandera y solo acá: este cascarón es el shell WEB. `/m` tiene su propio
  // layout y no monta nada de esto, así que el atajo no existe en la app móvil.
  // El botón buscador del topbar es el disparador: el hook lo enfoca antes de abrir para
  // que `Modal` le devuelva el foco al cerrar, también cuando se abrió con ⌘K.
  const botonBusqueda = useRef<HTMLButtonElement>(null);
  const paleta = useCommandPalette(navV2, botonBusqueda);

  // Render inicial SIEMPRE expandido y la preferencia se aplica en un efecto: leer
  // localStorage durante el render daría un HTML distinto en servidor y cliente (#418).
  // El precio es un parpadeo conocido para quien lo dejó colapsado — el sidebar nace ancho
  // y se encoge tras la hidratación. Se quita cuando la preferencia viaje en una cookie,
  // que el servidor sí puede leer.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE_COLAPSADO) === "1") setCollapsed(true);
    } catch {
      // Modo privado o almacenamiento bloqueado: se queda expandido, que es el default.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const siguiente = !prev;
      try {
        window.localStorage.setItem(CLAVE_COLAPSADO, siguiente ? "1" : "0");
      } catch {
        // Si no se puede persistir, el colapso igual funciona en esta sesión.
      }
      return siguiente;
    });
  };

  return (
    <ToastProvider>
      <TimezoneProvider value={timezone ?? null}>
        <CurrencyProvider value={currencies}>
          <div className={cn("app", navV2 && collapsed && "sb2-collapsed")}>
            {navV2 ? (
              // badges y journey todavía no se cablean: este delta es solo el cascarón.
              <SidebarV2
                open={drawer}
                onNavigate={close}
                user={user}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
              />
            ) : (
              <Sidebar open={drawer} onNavigate={close} user={user} navBadges={navBadges} />
            )}
            <main className="main">
              {navV2 ? (
                <TopbarV2
                  onMenu={() => setDrawer(true)}
                  currency={currency}
                  defaultPeriod={defaultPeriod}
                  onAbrirPaleta={paleta.abrir}
                  refBusqueda={botonBusqueda}
                />
              ) : (
                <Topbar onMenu={() => setDrawer(true)} currency={currency} />
              )}
              <div className="content">{children}</div>
            </main>
          </div>

          <div
            className={cn("sidebar-scrim", drawer && "open")}
            onClick={close}
            aria-hidden="true"
          />
          {navV2 ? <CommandPalette abierta={paleta.abierta} onCerrar={paleta.cerrar} /> : null}
          <BottomNav />
          <CoachPanel />
        </CurrencyProvider>
      </TimezoneProvider>
    </ToastProvider>
  );
}
