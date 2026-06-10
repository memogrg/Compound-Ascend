import { describe, it, expect } from "vitest";
import { rollupByGroup } from "@/modules/financial-base/engine/budget-rollup";
import type { Category, CategoryNode } from "@/modules/financial-base/services/categories-service";

function cat(id: string, name: string, color: string | null, parentId: string | null): Category {
  return {
    id,
    key: id,
    name,
    defaultNature: null,
    parentId,
    icon: null,
    color,
    isFavorite: false,
    isActive: true,
    isSystem: true,
    categoryType: "expense",
    sortOrder: 0,
    linkedKind: null,
  };
}

const tree: CategoryNode[] = [
  { ...cat("g1", "Vivienda", "var(--c-expense)", null), children: [cat("c1", "Alquiler", null, "g1"), cat("c2", "Servicios", null, "g1")] },
  { ...cat("g2", "Transporte", "var(--info)", null), children: [cat("c3", "Combustible", null, "g2")] },
];

describe("rollupByGroup", () => {
  it("suma presupuesto y real de las subcategorías a su grupo", () => {
    const budget = { c1: { label: "Alquiler", value: 300 }, c2: { label: "Servicios", value: 100 }, c3: { label: "Combustible", value: 80 } };
    const real = { c1: { label: "Alquiler", value: 300 }, c3: { label: "Combustible", value: 120 } };
    const rows = rollupByGroup(budget, real, tree);

    const vivienda = rows.find((r) => r.groupId === "g1")!;
    expect(vivienda.budget).toBe(400);
    expect(vivienda.real).toBe(300);
    expect(vivienda.pct).toBeCloseTo(0.75, 6);

    const transporte = rows.find((r) => r.groupId === "g2")!;
    expect(transporte.budget).toBe(80);
    expect(transporte.real).toBe(120);
    expect(transporte.pct).toBeCloseTo(1.5, 6); // sobre-gasto
  });

  it("agrupa lo no clasificado en 'Sin grupo' y lo deja al final", () => {
    const rows = rollupByGroup({ desconocida: { label: "X", value: 50 } }, {}, tree);
    expect(rows[rows.length - 1]!.groupId).toBe("__none__");
    expect(rows.find((r) => r.groupId === "__none__")!.budget).toBe(50);
  });

  it("respeta el orden del árbol", () => {
    const rows = rollupByGroup({ c3: { label: "Combustible", value: 1 }, c1: { label: "Alquiler", value: 1 } }, {}, tree);
    expect(rows.map((r) => r.groupId)).toEqual(["g1", "g2"]);
  });
});
