/**
 * Resolución PURA de la personalización de categorías por hogar (Fase 1).
 *
 * Dado el conjunto AMPLIO de categorías visibles (sistema + propias + del hogar) y
 * los `category_overrides` del scope activo, produce la lista RESUELTA que ve el
 * usuario:
 *   - oculta (quita) las bases intervenidas con `hidden`/`fork`,
 *   - re-parenta al FORK los hijos de una base forkeada (adopción por parent_id),
 *     de modo que la copia reemplaza al original con todo su subárbol,
 *   - DESCARTA los hijos huérfanos de una base oculta SIN fork (un sobre cuyo
 *     frasco base se ocultó y no se reemplazó no debe quedar suelto).
 *
 * IDENTIDAD (misma referencia y orden) cuando no hay overrides efectivos → cero
 * regresión para el 99% de usuarios sin personalización. Sin efectos, testeable a
 * mano; la reutilizan el servicio de sesión y los caminos service-role (WhatsApp).
 */

export type OverrideLite = {
  /** Categoría BASE intervenida. */
  categoryId: string;
  hidden: boolean;
  /** Copia del hogar que reemplaza a la base, o null. */
  forkId: string | null;
};

/** Forma mínima que necesita la resolución: id + su padre. */
export type ResolvableCategory = { id: string; parentId: string | null };

/**
 * Aplica `overrides` sobre `cats`. Genérico: conserva el tipo concreto de cada
 * categoría (Category, fila cruda, etc.); solo lee `id`/`parentId` y, al adoptar
 * un hijo a su fork, devuelve una copia con el `parentId` re-apuntado.
 */
export function resolveCategoryOverrides<T extends ResolvableCategory>(
  cats: T[],
  overrides: OverrideLite[],
): T[] {
  if (overrides.length === 0) return cats; // identidad: sin overrides, sin trabajo

  // Un fork SIEMPRE implica ocultar la base (así se crea en forkCategory), pero
  // toleramos overrides con fork y hidden=false por robustez.
  const hiddenBases = new Set<string>();
  const forkOf = new Map<string, string>();
  for (const o of overrides) {
    if (o.forkId) {
      hiddenBases.add(o.categoryId);
      forkOf.set(o.categoryId, o.forkId);
    } else if (o.hidden) {
      hiddenBases.add(o.categoryId);
    }
  }
  if (hiddenBases.size === 0) return cats; // overrides sin efecto → identidad

  const out: T[] = [];
  for (const c of cats) {
    // La base intervenida (oculta o forkeada) se quita: su fork ya está en `cats`.
    if (hiddenBases.has(c.id)) continue;

    const parentId = c.parentId;
    if (parentId && hiddenBases.has(parentId)) {
      const fork = forkOf.get(parentId);
      if (fork) {
        // El frasco base fue forkeado → el hijo se adopta al fork.
        out.push({ ...c, parentId: fork });
      }
      // else: huérfano de un frasco oculto SIN fork → se descarta.
      continue;
    }
    out.push(c);
  }
  return out;
}
