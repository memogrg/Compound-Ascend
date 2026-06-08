/**
 * Rollup de presupuesto/real al grupo de Nivel 1 (puro, testeable). Suma el
 * presupuesto y lo real de todas las subcategorías de cada grupo del árbol.
 * Las categorías sin grupo (o sin categoría) caen en un bucket "Sin grupo".
 */
import type { CategoryNode } from "@/modules/financial-base/services/categories-service";

export type KeyedTotals = Record<string, { label: string; value: number }>;
export type GroupRollup = {
  groupId: string;
  groupName: string;
  color: string;
  budget: number;
  real: number;
  pct: number; // real / budget (0 si no hay presupuesto)
};

/** Mapa categoryId → groupId (un grupo se mapea a sí mismo). */
function buildCatToGroup(tree: CategoryNode[]): Map<string, { id: string; name: string; color: string }> {
  const map = new Map<string, { id: string; name: string; color: string }>();
  for (const g of tree) {
    const info = { id: g.id, name: g.name, color: g.color ?? "var(--muted-2)" };
    map.set(g.id, info);
    for (const c of g.children) map.set(c.id, info);
  }
  return map;
}

export function rollupByGroup(
  budgetByKey: KeyedTotals,
  realByKey: KeyedTotals,
  tree: CategoryNode[],
): GroupRollup[] {
  const catToGroup = buildCatToGroup(tree);
  const acc = new Map<string, { name: string; color: string; budget: number; real: number }>();

  const ensure = (id: string, name: string, color: string) => {
    if (!acc.has(id)) acc.set(id, { name, color, budget: 0, real: 0 });
    return acc.get(id)!;
  };

  const add = (map: KeyedTotals, field: "budget" | "real") => {
    for (const [key, { value }] of Object.entries(map)) {
      const grp = catToGroup.get(key);
      if (grp) ensure(grp.id, grp.name, grp.color)[field] += value;
      else ensure("__none__", "Sin grupo", "var(--muted-2)")[field] += value;
    }
  };

  add(budgetByKey, "budget");
  add(realByKey, "real");

  // Orden del árbol primero; "Sin grupo" al final.
  const order = new Map(tree.map((g, i) => [g.id, i]));
  return [...acc.entries()]
    .map(([groupId, v]) => ({
      groupId,
      groupName: v.name,
      color: v.color,
      budget: Math.round(v.budget),
      real: Math.round(v.real),
      pct: v.budget > 0 ? v.real / v.budget : 0,
    }))
    .sort((a, b) => {
      const oa = a.groupId === "__none__" ? 999 : order.get(a.groupId) ?? 998;
      const ob = b.groupId === "__none__" ? 999 : order.get(b.groupId) ?? 998;
      return oa - ob;
    });
}
