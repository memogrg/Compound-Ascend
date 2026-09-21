/**
 * La parte PURA del sidebar v2: qué ítems se pintan y cuáles van marcados.
 *
 * Vive aparte del componente a propósito. El repo no tiene `@testing-library/react` ni un
 * entorno DOM en vitest (`environment: "node"`), así que un test de render no es posible sin
 * instalar dependencias. Sacando la decisión del JSX, lo que importa —el orden, el activo,
 * qué pestañas aparecen y con qué contador— se prueba igual, y el componente queda reducido
 * a pintar lo que esta función devuelve.
 */
import {
  NUCLEOS,
  nucleoDeRuta,
  pestanaDeRuta,
  type BadgeKey,
  type Nucleo,
} from "@/lib/constants/nav-v2";

export type Badges = Partial<Record<BadgeKey, number>>;

export type ItemNucleo = {
  nucleo: Nucleo;
  activo: boolean;
  /** Contador ya resuelto. `null` cuando es 0 o no vino: el chip no se pinta. */
  badge: number | null;
  /**
   * Pestañas a mostrar bajo este ítem. Solo del núcleo activo, y solo las que tienen
   * pantalla web: una `futura` como Libertad tiene `hrefM` pero no `href`, y un enlace
   * sin destino no se pinta.
   */
  tabs: Array<{ id: string; name: string; href: string; activa: boolean }>;
};

/**
 * Los 5 ítems del sidebar para una ruta dada.
 *
 * `search` es la query de la URL (`?tab=progreso`), que hace falta para distinguir
 * Acciones de Progreso: comparten pathname.
 */
export function itemsDeSidebar(
  pathname: string,
  search: string | null,
  badges: Badges = {},
): ItemNucleo[] {
  const nucleoActivo = nucleoDeRuta(pathname, search);
  const pestanaActiva = pestanaDeRuta(pathname, search)?.pestana ?? null;

  return NUCLEOS.map((nucleo) => {
    const activo = nucleoActivo?.id === nucleo.id;
    const cuenta = nucleo.badgeKey ? badges[nucleo.badgeKey] : undefined;
    return {
      nucleo,
      activo,
      badge: cuenta && cuenta > 0 ? cuenta : null,
      tabs: activo
        ? nucleo.tabs
            .filter((t) => t.status === "existente" && t.href !== null)
            .map((t) => ({
              id: t.id,
              name: t.name,
              href: t.href as string,
              activa: pestanaActiva?.id === t.id,
            }))
        : [],
    };
  });
}
