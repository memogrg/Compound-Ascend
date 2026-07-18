import { describe, it, expect } from "vitest";
import { buildCategoryOptionGroups } from "@/modules/financial-base/engine/category-options";
import type { Category } from "@/modules/financial-base/services/categories-service";

function cat(over: Partial<Category>): Category {
  return {
    id: over.id ?? "x",
    key: null,
    name: over.name ?? "",
    defaultNature: null,
    parentId: over.parentId ?? null,
    icon: null,
    color: null,
    isFavorite: false,
    isActive: over.isActive ?? true,
    isSystem: true,
    categoryType: over.categoryType ?? "expense",
    sortOrder: over.sortOrder ?? 0,
    linkedKind: null,
  };
}

describe("buildCategoryOptionGroups (destinos de reasignación)", () => {
  it("cada grupo abre con '(general)' y sigue con sus hojas, en orden", () => {
    const groups = buildCategoryOptionGroups([
      cat({ id: "g2", name: "Transporte", sortOrder: 2 }),
      cat({ id: "g1", name: "Vivienda", sortOrder: 1 }),
      cat({ id: "c2", name: "Alquiler", parentId: "g1", sortOrder: 2 }),
      cat({ id: "c1", name: "Servicios", parentId: "g1", sortOrder: 1 }),
    ]);
    expect(groups.map((g) => g.groupName)).toEqual(["Vivienda", "Transporte"]);
    expect(groups[0]!.options.map((o) => o.name)).toEqual([
      "Vivienda (general)",
      "Servicios",
      "Alquiler",
    ]);
    // Un grupo sin hojas igual ofrece su "(general)".
    expect(groups[1]!.options.map((o) => o.id)).toEqual(["g2"]);
  });

  it("excluye inactivas y las que no son de gasto; 'both' sí entra", () => {
    const groups = buildCategoryOptionGroups([
      cat({ id: "g1", name: "Vivienda" }),
      cat({ id: "c1", name: "Inactiva", parentId: "g1", isActive: false }),
      cat({ id: "c2", name: "Sueldo", parentId: "g1", categoryType: "income" }),
      cat({ id: "c3", name: "Mixta", parentId: "g1", categoryType: "both" }),
      cat({ id: "g2", name: "Ingresos", categoryType: "income" }),
    ]);
    expect(groups.map((g) => g.groupName)).toEqual(["Vivienda"]);
    expect(groups[0]!.options.map((o) => o.name)).toEqual(["Vivienda (general)", "Mixta"]);
  });
});
