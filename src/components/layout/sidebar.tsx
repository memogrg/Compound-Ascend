"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/constants/nav";
import { Icon } from "@/components/ui/icon";
import { BrandMark } from "@/components/layout/brand-mark";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { cn } from "@/lib/utils";

type SidebarProps = {
  open: boolean;
  onNavigate: () => void;
  user?: { name: string; sub: string; initials: string };
  navBadges?: Record<string, number>;
};

export function Sidebar({ open, onNavigate, user, navBadges }: SidebarProps) {
  const pathname = usePathname();
  const activeId = activeNavId(pathname);
  const u = user ?? { name: "Invitado", sub: "Configura tu perfil", initials: "CA" };

  return (
    <aside className={cn("sidebar", open && "open")}>
      <div className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">
            CARTERA<span className="ascend">+</span>
          </div>
          <div className="brand-sub">Sistema Financiero</div>
        </div>
      </div>

      <div className="nav-scroll">
        {NAV.map((group) => (
          <div key={group.label} className="nav-group">
            <div className="nav-label">{group.label}</div>
            <nav className="nav">
              {group.items.map((it) => (
                <Link
                  key={it.id}
                  href={it.href}
                  data-nav={it.id}
                  onClick={onNavigate}
                  className={cn("nav-item", it.id === activeId && "active")}
                >
                  <span className="nav-icon">
                    <Icon name={it.icon} />
                  </span>
                  <span>{it.name}</span>
                  {navBadges?.[it.id] ? (
                    <span className="nav-badge">{navBadges[it.id]}</span>
                  ) : it.badge ? (
                    <span className="nav-badge">{it.badge}</span>
                  ) : null}
                  {it.dot ? <span className="nav-dot" style={{ background: it.dot }} /> : null}
                </Link>
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="sidebar-foot">
        <div className="user-row">
          <div className="avatar">{u.initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{u.name}</div>
            <div className="user-mail">{u.sub}</div>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

/** Determina el ítem de nav activo según el pathname (match por prefijo). */
function activeNavId(pathname: string): string {
  let best: { id: string; len: number } | null = null;
  for (const group of NAV) {
    for (const it of group.items) {
      const base = it.href.split("#")[0]!;
      if (pathname === base || (base !== "/" && pathname.startsWith(base))) {
        if (!best || base.length > best.len) best = { id: it.id, len: base.length };
      }
    }
  }
  return best?.id ?? "dashboard";
}
