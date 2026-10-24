/**
 * La parte PURA de la barra inferior: qué destinos se pintan, con qué URL y cuál está activo.
 *
 * Aparte del componente por lo mismo que `sidebar-v2-items.ts` y `nucleo-tabs-items.ts`: sin
 * RTL ni entorno DOM en vitest, lo que importa se prueba aquí y el componente queda reducido
 * a pintarlo.
 */
import { conPeriodo } from "@/components/layout/nucleo-tabs-items";
import { BOTTOM_NAV, type NavItem } from "@/lib/constants/nav";
import { BOTTOM_NAV_V2, nucleoDeRuta } from "@/lib/constants/nav-v2";
import type { IconName } from "@/components/ui/icon";

export type ItemBarra = {
  id: string;
  /** Lo que se lee bajo el ícono. Corto: en 390 px caben cinco de ~72 px. */
  etiqueta: string;
  icon: IconName;
  href: string;
  activo: boolean;
};

/**
 * Etiquetas cortas de la barra v1. Los nombres completos del NAV («Centro de mando»,
 * «Portafolio de inversiones») no caben bajo un ícono de 20 px.
 */
const CORTA_V1: Record<string, string> = {
  dashboard: "Centro",
  assistant: "Agente",
  base: "Base",
  control: "Ahorro",
  wealth: "Portafolio",
  "rich-life": "Patrimonio",
};

/** Activo de la barra v1: por prefijo de ruta, como estaba. */
function activoV1(item: NavItem, pathname: string): boolean {
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * Los destinos de la barra inferior.
 *
 * Con la bandera apagada son los seis de `BOTTOM_NAV` y el activo se decide por prefijo,
 * exactamente como antes — el contrato es que la barra vieja no cambie ni un píxel.
 *
 * Con la bandera encendida son los cinco núcleos de `BOTTOM_NAV_V2`, y el activo lo decide
 * `nucleoDeRuta`, que es el mismo juez que usan el sidebar y las pestañas: así una ruta
 * profunda como `/gastos` marca Flujo en los tres sitios a la vez, sin tres reglas distintas
 * que se desincronicen.
 *
 * El periodo viaja en los enlaces igual que en `NucleoTabs`: si alguien está mirando agosto
 * y toca «Planes», sigue mirando agosto. Sería raro que la barra fuera el único sitio de la
 * app que lo pierde.
 */
export function itemsDeBarra(navV2: boolean, pathname: string, search: string | null): ItemBarra[] {
  if (!navV2) {
    return BOTTOM_NAV.map((it) => ({
      id: it.id,
      etiqueta: CORTA_V1[it.id] ?? it.name,
      icon: it.icon,
      href: it.href,
      activo: activoV1(it, pathname),
    }));
  }

  const activo = nucleoDeRuta(pathname, search);
  return BOTTOM_NAV_V2.map((n) => ({
    id: n.id,
    etiqueta: n.name,
    icon: n.icon,
    href: conPeriodo(n.href, search),
    activo: activo?.id === n.id,
  }));
}
