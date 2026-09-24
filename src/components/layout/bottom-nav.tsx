"use client";

import { Suspense } from "react";
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
function Barra({ items }: { items: ReturnType<typeof itemsDeBarra> }) {
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

/** La barra que SÍ lee la query, para poder propagar el periodo. */
function BarraConPeriodo() {
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  return <Barra items={itemsDeBarra(navV2Enabled(), pathname, searchParams?.toString() ?? null)} />;
}

export function BottomNav() {
  const pathname = usePathname() ?? "/dashboard";

  /**
   * `Suspense` obligatorio, y aprendido a la mala: `useSearchParams` obliga a Next a
   * renderizar la página en cliente, y sin un límite que acote esa decisión el prerender de
   * las rutas estáticas —`/configuracion` fue la primera en caer— falla con
   * «useSearchParams() should be wrapped in a suspense boundary».
   *
   * `NucleoTabs` usa el mismo hook y nunca dio problema porque vive dentro del topbar v2, que
   * solo se monta con la bandera encendida; esta barra se monta SIEMPRE.
   *
   * El fallback pinta la misma barra sin periodo en vez de un hueco: los ítems y el activo no
   * dependen de la query —solo los `href` lo hacen—, así que no hay salto de layout ni un
   * parpadeo de cinco huecos mientras se hidrata.
   */
  return (
    <Suspense fallback={<Barra items={itemsDeBarra(navV2Enabled(), pathname, null)} />}>
      <BarraConPeriodo />
    </Suspense>
  );
}
