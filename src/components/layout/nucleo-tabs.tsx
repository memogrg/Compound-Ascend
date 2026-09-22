"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { itemsDePestanas, type Badges } from "@/components/layout/nucleo-tabs-items";
import { cn } from "@/lib/utils";

/**
 * Pestañas del núcleo activo, bajo el título (03-navigation §«Barra superior»).
 *
 * NO lleva `role="tablist"`. Un tablist promete paneles que se intercambian en la misma
 * página; esto son rutas distintas, y anunciarlo como pestañas ARIA haría que un lector de
 * pantalla espere flechas para moverse entre paneles que no existen. Son enlaces, con
 * `aria-current="page"` en el activo — que es como se marca el destino actual.
 */
export function NucleoTabs({ badges }: { badges?: Badges }) {
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  const items = itemsDePestanas(pathname, searchParams?.toString() ?? null, badges);

  if (items.length === 0) return null;

  return (
    <nav className="tb2-tabs" aria-label="Secciones">
      {items.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.activa ? "page" : undefined}
          className={cn("tb2-tab", t.activa && "tb2-tab-on")}
        >
          {t.name}
          {t.badge !== null ? (
            <span className="tb2-tab-badge" aria-label={`${t.badge} pendientes`}>
              {t.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
