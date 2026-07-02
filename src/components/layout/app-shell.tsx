"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { CoachPanel } from "@/components/ai/coach-panel";
import { ToastProvider } from "@/components/ui/toast";
import { CurrencyProvider } from "@/components/layout/currency-context";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  user?: { name: string; sub: string; initials: string };
  currency?: { display: string; primary: string };
  /** Conteos dinámicos por id de nav (ej. stubs de inversión por completar). */
  navBadges?: Record<string, number>;
};

/** Cascarón principal de la app: sidebar + topbar + contenido + coach + nav móvil. */
export function AppShell({ children, user, currency, navBadges }: AppShellProps) {
  const [drawer, setDrawer] = useState(false);
  const close = () => setDrawer(false);
  const currencies = currency ?? { display: "CRC", primary: "CRC" };

  return (
    <ToastProvider>
      <CurrencyProvider value={currencies}>
        <div className="app">
          <Sidebar open={drawer} onNavigate={close} user={user} navBadges={navBadges} />
          <main className="main">
            <Topbar onMenu={() => setDrawer(true)} currency={currency} />
            <div className="content">{children}</div>
          </main>
        </div>

        <div className={cn("sidebar-scrim", drawer && "open")} onClick={close} aria-hidden="true" />
        <BottomNav />
        <CoachPanel />
      </CurrencyProvider>
    </ToastProvider>
  );
}
