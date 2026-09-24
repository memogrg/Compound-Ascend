"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { itemsDeBarra } from "@/components/layout/bottom-nav-items";
import { Icon } from "@/components/ui/icon";
import { navV2Enabled } from "@/lib/flags";
import { cn } from "@/lib/utils";

/**
 * Barra de navegación inferior — visible solo en pantallas estrechas (CSS @media).
 *
 * Con `NAV_V2` encendida pasa a los cinco núcleos, los mismos del sidebar y de `/m`: hasta
 * ahora la web estrecha era el único sitio de la app que seguía con los seis destinos
 * viejos, así que la misma persona veía dos modelos de navegación distintos según el ancho
 * de la ventana.
 *
 * `aria-current="page"` en el activo, como en `NucleoTabs`. No lleva `role="tablist"`: un
 * tablist promete paneles que se intercambian en la misma página, y esto son rutas.
 */
export function BottomNav() {
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  const items = itemsDeBarra(navV2Enabled(), pathname, searchParams?.toString() ?? null);

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {items.map((it) => (
        <Link
          key={it.id}
          href={it.href}
          aria-current={it.activo ? "page" : undefined}
          className={cn("bn-item", it.activo && "active")}
        >
          <Icon name={it.icon} />
          <span>{it.etiqueta}</span>
        </Link>
      ))}
    </nav>
  );
}
