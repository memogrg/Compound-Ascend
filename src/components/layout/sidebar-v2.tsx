"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { BrandMark } from "@/components/layout/brand-mark";
import { itemsDeSidebar, type Badges } from "@/components/layout/sidebar-v2-items";
import { Icon } from "@/components/ui/icon";
import { CONFIGURACION } from "@/lib/constants/nav-v2";
import { cn } from "@/lib/utils";

/** El riel del viaje. Sin datos no se renderiza: un riel vacío no dice nada. */
export type Journey = { etapa: number; total: number; titulo: string; siguiente: string };

type SidebarV2Props = {
  open: boolean;
  onNavigate: () => void;
  user?: { name: string; sub: string; initials: string };
  collapsed: boolean;
  onToggleCollapsed: () => void;
  badges?: Badges;
  journey?: Journey;
};

/** Cuenta y plan. Se toma del modelo, no de una ruta escrita a mano. */
const CUENTA = CONFIGURACION[1];

/**
 * Sidebar v2: 5 núcleos planos, las pestañas del activo debajo, riel al pie.
 *
 * Detrás de `navV2Enabled()`: con la bandera apagada este componente no se monta y el
 * `Sidebar` v1 queda intacto.
 *
 * Reusa la clase `.sidebar` además de las suyas `sb2-*`. No es descuido: el drawer móvil
 * (`position: fixed` + `transform` + `.open`), el scrim y el `sticky` de escritorio ya viven
 * en `shell.css`/`responsive.css` y funcionan. Duplicarlos en `sb2-` sería mantener dos
 * copias del mismo comportamiento. Lo nuevo —ítems, pestañas, riel, colapso— sí va con
 * prefijo propio para no chocar con `.nav-item` del shell viejo ni con Tailwind.
 */
export function SidebarV2({
  open,
  onNavigate,
  user,
  collapsed,
  onToggleCollapsed,
  badges,
  journey,
}: SidebarV2Props) {
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  const items = itemsDeSidebar(pathname, searchParams?.toString() ?? null, badges);
  const u = user ?? { name: "Invitado", sub: "Configura tu perfil", initials: "CA" };

  return (
    <aside className={cn("sidebar", "sb2", open && "open", collapsed && "sb2-collapsed")}>
      <div className="brand sb2-brand">
        <BrandMark />
        {/* El nombre se oculta por CSS, no se desmonta: así el colapso es una transición
            de anchura y no un remonte del árbol. */}
        <div className="sb2-brand-text">
          <div className="brand-name">
            CARTERA<span className="ascend">+</span>
          </div>
          <div className="brand-sub">Sistema Financiero</div>
        </div>
      </div>

      <button
        type="button"
        className="sb2-toggle"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
      >
        <Icon name="chev" />
      </button>

      <nav className="sb2-nav" aria-label="Navegación principal">
        {items.map(({ nucleo, activo, badge, tabs }) => (
          <div key={nucleo.id} className="sb2-group">
            <Link
              href={nucleo.href}
              data-nav-v2={nucleo.id}
              onClick={onNavigate}
              title={nucleo.name}
              aria-current={activo ? "page" : undefined}
              className={cn("sb2-item", activo && "sb2-active")}
            >
              <span className="sb2-icon">
                <Icon name={nucleo.icon} />
              </span>
              {/* Visible al expandir; colapsado queda solo para lectores de pantalla, que
                  no leen el `title`. */}
              <span className="sb2-label">{nucleo.name}</span>
              <span className="sb2-sr-only">{nucleo.name}</span>
              {badge !== null ? (
                <span className="sb2-badge" aria-label={`${badge} pendientes`}>
                  {badge}
                </span>
              ) : null}
            </Link>

            {tabs.length > 0 ? (
              <div className="sb2-tabs">
                {tabs.map((t) => (
                  <Link
                    key={t.id}
                    href={t.href}
                    onClick={onNavigate}
                    aria-current={t.activa ? "page" : undefined}
                    className={cn("sb2-item", "sb2-sub", t.activa && "sb2-active")}
                  >
                    <span className="sb2-label">{t.name}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>

      {journey ? (
        <div className="sb2-rail">
          <div className="sb2-rail-t">Tu camino</div>
          <div
            className="sb2-rail-steps"
            role="img"
            aria-label={`Etapa ${journey.etapa} de ${journey.total}: ${journey.titulo}`}
          >
            {Array.from({ length: journey.total }, (_, i) => (
              <i key={i} className={cn(i < journey.etapa && "on")} />
            ))}
          </div>
          <div className="sb2-rail-s">
            <b>{journey.titulo}</b>
            <small>Siguiente: {journey.siguiente}</small>
          </div>
        </div>
      ) : null}

      <div className="sidebar-foot sb2-foot">
        <div className="user-row">
          <div className="avatar">{u.initials}</div>
          <div className="sb2-user-text" style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name">{u.name}</div>
            <div className="user-mail">{u.sub}</div>
          </div>
          {CUENTA?.href ? (
            <Link
              href={CUENTA.href}
              onClick={onNavigate}
              className="sb2-gear"
              aria-label={CUENTA.name}
              title={CUENTA.name}
            >
              <Icon name="gear" />
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
