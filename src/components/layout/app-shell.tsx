"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { CoachPanel } from "@/components/ai/coach-panel";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  user?: { name: string; sub: string; initials: string };
  currency?: { display: string; primary: string };
};

/** Cascarón principal de la app: sidebar + topbar + contenido + coach + nav móvil. */
export function AppShell({ children, user, currency }: AppShellProps) {
  const [drawer, setDrawer] = useState(false);
  const close = () => setDrawer(false);

  return (
    <ToastProvider>
      <div className="app">
        <Sidebar open={drawer} onNavigate={close} user={user} />
        <main className="main">
          <Topbar onMenu={() => setDrawer(true)} currency={currency} />
          {children}
        </main>
      </div>

      <div
        className={cn("sidebar-scrim", drawer && "open")}
        onClick={close}
        aria-hidden="true"
      />
      <BottomNav />
      <CoachPanel />
    </ToastProvider>
  );
}
