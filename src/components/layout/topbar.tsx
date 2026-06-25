"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { CurrencySwitch } from "@/components/layout/currency-switch";
import { BellNotifications } from "@/components/layout/bell-notifications";
import { resolvePageMeta } from "@/lib/constants/page-meta";

export function Topbar({
  onMenu,
  currency,
}: {
  onMenu: () => void;
  currency?: { display: string; primary: string };
}) {
  const pathname = usePathname();
  const meta = resolvePageMeta(pathname);

  return (
    <div className="topbar">
      <div className="crumbs" style={{ alignItems: "center", gap: 14 }}>
        <button className="icon-btn hamburger" aria-label="Menú" onClick={onMenu}>
          <Icon name="menu" />
        </button>
        <div>
          <div className="crumbs" style={{ marginBottom: 3 }}>
            <span className="crumb-mut">{meta.crumb}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-now">{meta.title}</span>
          </div>
          <div
            className="page-title"
            dangerouslySetInnerHTML={{ __html: meta.titleHTML ?? meta.title }}
          />
        </div>
      </div>

      <div className="topbar-actions">
        <div className="search">
          <Icon name="search" style={{ width: 14, height: 14, color: "var(--muted)" }} />
          <input placeholder="Buscar cuentas, inversiones…" aria-label="Buscar" />
          <span className="kbd">⌘K</span>
        </div>
        {currency ? <CurrencySwitch current={currency.display} primary={currency.primary} /> : null}
        <BellNotifications />
        <Link href="/configuracion" className="icon-btn" aria-label="Ajustes">
          <Icon name="gear" />
        </Link>
        <ThemeToggle />
      </div>
    </div>
  );
}
