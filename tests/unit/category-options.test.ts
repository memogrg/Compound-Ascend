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
    isEssential: false,
    isActive: over.isActive ?? true,
    isSystem: true,
    categoryType: over.categoryType ?? "expense",
    sortOrder: over.sortOrder ?? 0,
    linkedKind: null,
  };
}

describe("buildCategoryOptionGroups (destinos de reasignación)", () => {
  it("cada grupo abre con 'Sin sobre específico' y sigue con sus hojas, en orden", () => {
    const groups = buildCategoryOptionGroups([
      cat({ id: "g2", name: "Transporte", sortOrder: 2 }),
      cat({ id: "g1", name: "Vivienda", sortOrder: 1 }),
      cat({ id: "c2", name: "Alquiler", parentId: "g1", sortOrder: 2 }),
      cat({ id: "c1", name: "Servicios", parentId: "g1", sortOrder: 1 }),
    ]);
    expect(groups.map((g) => g.groupName)).toEqual(["Vivienda", "Transporte"]);
    expect(groups[0]!.options.map((o) => o.name)).toEqual([
      "Sin sobre específico",
      "Servicios",
      "Alquiler",
    ]);
    // Un grupo sin hojas igual ofrece su opción de "sin sobre".
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
    expect(groups[0]!.options.map((o) => o.name)).toEqual(["Sin sobre específico", "Mixta"]);
  });

  /**
   * El motivo del nombre, no solo el nombre. La opción del frasco NO puede llamarse como
   * el frasco: existen hojas legadas homónimas (key='vivienda' bajo el grupo 'Vivienda',
   * preservadas de la taxonomía vieja), y repetir el nombre producía pares
   * indistinguibles — "Vivienda · Vivienda (general)" junto a "Vivienda · Vivienda".
   */
  /**
   * El bug que arregló 20260812000001. Mientras la taxonomía tuvo tres niveles, este
   * selector listaba solo las hijas DIRECTAS del frasco, así que 21 sobres reales —Luz,
   * Agua, Internet, Marchamo, Feria, Café…— eran inalcanzables desde el modal de
   * reasignar huérfanas. La BD ya está aplanada; recorrer los descendientes es lo que
   * evita que un tercer nivel futuro vuelva a esconderlos.
   */
  it("ofrece los NIETOS, no solo las hijas directas del frasco", () => {
    const groups = buildCategoryOptionGroups([
      cat({ id: "g1", name: "Vivienda" }),
      cat({ id: "medio", name: "Servicios y hogar", parentId: "g1", sortOrder: 1 }),
      cat({ id: "nieta", name: "Luz", parentId: "medio", sortOrder: 2 }),
      cat({ id: "bisnieta", name: "Recibo viejo", parentId: "nieta", sortOrder: 3 }),
    ]);
    expect(groups[0]!.options.map((o) => o.name)).toEqual([
      "Sin sobre específico",
      "Servicios y hogar",
      "Luz",
      "Recibo viejo",
    ]);
  });

  it("un ciclo de parent_id no cuelga el selector", () => {
    const groups = buildCategoryOptionGroups([
      cat({ id: "g1", name: "Vivienda" }),
      cat({ id: "a", name: "A", parentId: "g1" }),
      cat({ id: "b", name: "B", parentId: "a" }),
    ]);
    // `a` y `b` entran una sola vez cada una.
    expect(groups[0]!.options.map((o) => o.id)).toEqual(["g1", "a", "b"]);
  });

  it("la opción del frasco no repite el nombre del frasco (desambigua de una hoja homónima)", () => {
    const groups = buildCategoryOptionGroups([
      cat({ id: "g1", name: "Vivienda" }),
      cat({ id: "legacy", name: "Vivienda", parentId: "g1" }), // hoja legada homónima
    ]);
    const names = groups[0]!.options.map((o) => o.name);
    // La primera opción es el frasco (su id es el del grupo) y se distingue de la hoja.
    expect(groups[0]!.options[0]!.id).toBe("g1");
    expect(names[0]).not.toBe("Vivienda");
    expect(new Set(names).size).toBe(names.length); // sin etiquetas duplicadas
  });
});
