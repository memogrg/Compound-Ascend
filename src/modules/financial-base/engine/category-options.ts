/**
 * Destinos de categoría para selectores de reasignación: cada grupo de Nivel 1
 * con su opción "sin sobre específico" seguida de sus hojas.
 *
 * Vive en el engine (puro, sin `server-only`) porque lo consumen tanto la web
 * como el cliente móvil. Deliberadamente NO se reutiliza
 * listExpenseCategoriesAction: esa acción vive en el módulo `control`, y la
 * dependencia va control → financial-base, nunca al revés (CLAUDE.md).
 */
import type { Category } from "@/modules/financial-base/services/categories-service";

export type CategoryOption = { id: string; name: string };
export type CategoryOptionGroup = { groupName: string; options: CategoryOption[] };

/** Solo categorías de gasto activas; respeta el `sortOrder` del árbol. */
export function buildCategoryOptionGroups(categories: Category[]): CategoryOptionGroup[] {
  const usable = categories.filter(
    (c) => c.isActive && (c.categoryType === "expense" || c.categoryType === "both"),
  );

  // TODOS los descendientes del frasco, no solo las hijas directas — igual que
  // `listCategoryTree`. Listar un solo nivel escondía sobres reales: mientras la
  // taxonomía tuvo tres niveles (20260605000004 degradó las raíces viejas a hoja y
  // dejó a las suyas un escalón más abajo), este selector no podía ofrecer Luz, Agua,
  // Internet, Marchamo, Feria, Café… 21 sobres inalcanzables desde el modal de
  // reasignar huérfanas. 20260812000001 aplanó la BD a dos niveles, pero recorrer los
  // descendientes es lo que hace que un tercer nivel futuro no vuelva a esconder nada.
  // `visto` corta un eventual ciclo de parent_id (el FK no lo impide).
  function descendientes(raizId: string): Category[] {
    const out: Category[] = [];
    const visto = new Set<string>([raizId]);
    const pila = usable.filter((c) => c.parentId === raizId);
    while (pila.length) {
      const nodo = pila.shift()!;
      if (visto.has(nodo.id)) continue;
      visto.add(nodo.id);
      out.push(nodo);
      for (const h of usable.filter((c) => c.parentId === nodo.id)) {
        if (!visto.has(h.id)) pila.push(h);
      }
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"));
  }

  return usable
    .filter((c) => c.parentId == null)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((g) => ({
      groupName: g.name,
      options: [
        // "Sin sobre específico", NO "{Grupo} (general)". Esta opción categoriza en el
        // FRASCO (su id es el del grupo), y llamarla con el nombre del grupo producía
        // pares indistinguibles cuando existe además una hoja legada homónima:
        // "Vivienda · Vivienda (general)" junto a "Vivienda · Vivienda" (la hoja real
        // key='vivienda', de la taxonomía antigua). 20260812000001 retiró esas cuatro
        // hojas, pero el nombre se queda: dice lo que la opción HACE, y "(general)" no
        // decía nada. La desambiguación sigue cubierta por si reaparece una homónima.
        { id: g.id, name: "Sin sobre específico" },
        ...descendientes(g.id).map((c) => ({ id: c.id, name: c.name })),
      ],
    }));
}
