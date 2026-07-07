"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Tab bar inferior fija del shell móvil. 4 destinos que existen en el diseño
 * (design-movil/project/CARTERA Movil.html). El estado activo se deriva de la
 * ruta actual. Los enlaces quedan aunque su pantalla aún no exista (deltas).
 */

type Tab = { href: string; label: string; icon: React.ReactNode };

const TABS: Tab[] = [
  {
    href: "/m",
    label: "Inicio",
    icon: (
      <path
        d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/m/inversiones",
    // Canónico "Portafolio de inversiones" (nav.ts); abreviado en la tab por espacio.
    // El nombre completo vive en el menú ☰.
    label: "Portafolio",
    icon: (
      <path
        d="M3 17l6-6 4 4 8-9M14 6h6v6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/m/patrimonio",
    label: "Patrimonio",
    icon: (
      <path
        d="M12 3v18M5 8c0-2 1.5-3 4-3h6c2.5 0 4 1 4 3s-1.5 3-4 3H9c-2.5 0-4 1-4 3s1.5 3 4 3h6c2.5 0 4-1 4-3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: "/m/perfil",
    // /m/perfil ahora es "Configuración"; en la tab va abreviado "Ajustes".
    label: "Ajustes",
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" strokeLinecap="round" />
      </>
    ),
  },
];

/** ¿La ruta actual corresponde a esta tab? (match exacto para /m, prefijo para el resto). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/m") return pathname === "/m";
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileTabBar() {
  const pathname = usePathname() ?? "/m";
  return (
    <nav className="m-tabbar" aria-label="Navegación móvil">
      {TABS.map((t) => {
        const on = isActive(pathname, t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`m-tab${on ? " on" : ""}`}
            aria-current={on ? "page" : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              {t.icon}
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
