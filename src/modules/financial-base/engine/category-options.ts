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
        // key='vivienda', preservada de la taxonomía antigua). Colisiona en Vivienda,
        // Transporte, Alimentación y Educación. Nombrarla por lo que HACE en vez de
        // repetir el nombre del frasco desambigua sin tocar datos, y además explica la
        // opción: "(general)" no decía nada.
        { id: g.id, name: "Sin sobre específico" },
        ...usable
          .filter((c) => c.parentId === g.id)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((c) => ({ id: c.id, name: c.name })),
      ],
    }));
}
