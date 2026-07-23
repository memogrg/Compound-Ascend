/**
 * Clasificación de movimientos sin sobre (vista "Por clasificar"). Puro y testeable.
 *
 * Los gastos/ingresos que entran por WhatsApp o ingesta sin regla que matchee quedan
 * con categoryId=null → no caen en ningún frasco y la conciliación los ignora. Estos
 * helpers los detectan y arman las hojas de categoría seleccionables por naturaleza.
 */
import type { Transaction } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

/** Categoría hoja seleccionable (forma plana para el selector). */
export type SelectableCategory = { id: string; name: string; categoryType: string };

/** Hoja seleccionable con su frasco (padre) para mostrar "Frasco › Sobre". */
export type SelectableSobre = {
  id: string;
  sobre: string;
  frasco: string | null;
  categoryType: string;
};

/**
 * Transacciones "al aire": gasto/ingreso con categoryId nulo. Ignora las ya
 * categorizadas y los 'ajuste' (no van a un sobre).
 */
export function selectUncategorized(transactions: Transaction[]): Transaction[] {
  return transactions.filter(
    (t) => (t.kind === "gasto" || t.kind === "ingreso") && t.categoryId == null,
  );
}

/**
 * Hojas de categoría seleccionables: activas, que NO son padre de otra categoría
 * activa (hoja), y no de tipo 'transfer'. El selector filtra después por naturaleza
 * (gasto → expense/both; ingreso → income/both).
 */
export function selectableCategoryLeaves(categories: Category[]): SelectableCategory[] {
  const active = categories.filter((c) => c.isActive);
  const parentIds = new Set(active.map((c) => c.parentId).filter(Boolean));
  return active
    .filter((c) => !parentIds.has(c.id) && c.categoryType !== "transfer")
    .map((c) => ({ id: c.id, name: c.name, categoryType: c.categoryType }));
}

/**
 * Igual que selectableCategoryLeaves pero acompaña cada sobre (hoja) con el NOMBRE de su
 * frasco (categoría padre) para el selector "Frasco › Sobre". Si la hoja no tiene padre,
 * frasco = null. Puro: el nombre del frasco se resuelve del mismo conjunto de categorías.
 */
export function selectableSobresByFrasco(categories: Category[]): SelectableSobre[] {
  const active = categories.filter((c) => c.isActive);
  const parentIds = new Set(active.map((c) => c.parentId).filter(Boolean));
  const nameById = new Map(active.map((c) => [c.id, c.name]));
  return active
    .filter((c) => !parentIds.has(c.id) && c.categoryType !== "transfer")
    .map((c) => ({
      id: c.id,
      sobre: c.name,
      frasco: c.parentId ? (nameById.get(c.parentId) ?? null) : null,
      categoryType: c.categoryType,
    }));
}

/** ¿La hoja sirve para esta naturaleza? gasto→expense/both, ingreso→income/both. */
export function categoryMatchesKind(categoryType: string, kind: "gasto" | "ingreso"): boolean {
  if (categoryType === "both") return true;
  return kind === "gasto" ? categoryType === "expense" : categoryType === "income";
}
