/**
 * La parte PURA de las pestañas del núcleo: qué enlaces se pintan y con qué URL.
 *
 * Aparte del componente por lo mismo que `sidebar-v2-items.ts`: sin RTL ni entorno DOM en
 * vitest, lo que importa —los ítems, cuál va activa y qué parámetros conserva cada enlace—
 * se prueba aquí y el componente queda reducido a pintarlo.
 */
import { nucleoDeRuta, pestanaDeRuta, type BadgeKey } from "@/lib/constants/nav-v2";

export type Badges = Partial<Record<BadgeKey, number>>;

export type ItemPestana = {
  id: string;
  name: string;
  href: string;
  activa: boolean;
  /** Contador ya resuelto; `null` si es 0 o no vino. */
  badge: number | null;
};

/**
 * El periodo viaja con el usuario entre pestañas (03-navigation: «cada KPI enlaza a su
 * pestaña con el periodo activo»). Es el ÚNICO parámetro que se propaga: `?deuda=` de
 * Acciones o `?cat=` de Transacciones pertenecen a su pantalla y arrastrarlos a otra daría
 * un filtro que nadie pidió. El `?tab=` no se propaga, se respeta: viene del propio `href`
 * de la pestaña, que es quien lo define.
 */
export function conPeriodo(href: string, search: string | null): string {
  if (!search) return href;
  const period = new URLSearchParams(search).get("period");
  if (!period) return href;
  const [ruta, query] = href.split("?");
  const params = new URLSearchParams(query ?? "");
  params.set("period", period);
  return `${ruta}?${params.toString()}`;
}

/**
 * Pestañas del núcleo activo para una ruta.
 *
 * Devuelve `[]` cuando la ruta no está en el modelo o cuando el núcleo tiene una sola
 * pestaña: una barra con un único elemento no es navegación, es ruido (Asesor).
 */
export function itemsDePestanas(
  pathname: string,
  search: string | null,
  badges: Badges = {},
): ItemPestana[] {
  const nucleo = nucleoDeRuta(pathname, search);
  if (!nucleo) return [];

  const activa = pestanaDeRuta(pathname, search)?.pestana ?? null;
  // Solo las que tienen pantalla web: `recurrentes` (nueva) y `libertad` (futura en web)
  // no tienen `href` y un enlace sin destino no se pinta.
  const visibles = nucleo.tabs.filter((t) => t.status === "existente" && t.href !== null);
  if (visibles.length < 2) return [];

  const cuenta = nucleo.badgeKey ? badges[nucleo.badgeKey] : undefined;
  return visibles.map((t) => ({
    id: t.id,
    name: t.name,
    href: conPeriodo(t.href as string, search),
    activa: activa?.id === t.id,
    // El contador del núcleo se muestra en SU pestaña, no repetido en todas: el de «Hoy»
    // cuenta acciones pendientes, que viven en la pestaña Acciones.
    badge: t.id === "acciones" && cuenta && cuenta > 0 ? cuenta : null,
  }));
}
