import { describe, it, expect } from "vitest";
import { groupByJar } from "@/modules/financial-base/engine/expense-jars";
import type { Category, CategoryNode } from "@/modules/financial-base/services/categories-service";

/**
 * Agrupador ÚNICO frasco↔item (lo usan los sobres de /gastos y los "Objetivos
 * activos" de Control). Casos obligatorios: hijo → frasco padre; sin categoría →
 * Generales (primero); sin secciones vacías; nada se pierde ni se duplica.
 */

const cat = (id: string, name: string, parentId: string | null): Category => ({
  id,
  key: null,
  name,
  defaultNature: null,
  parentId,
  icon: null,
  color: null,
  isFavorite: false,
  isEssential: false,
  isActive: true,
  isSystem: false,
  categoryType: "expense",
  sortOrder: 0,
  linkedKind: null,
});
const node = (id: string, name: string, children: Category[]): CategoryNode => ({
  ...cat(id, name, null),
  children,
});

// g1 (con hoja c1) · g2 (con hoja c2) · g3 vacío. Orden del tree: g1, g2, g3.
const tree: CategoryNode[] = [
  node("g1", "Vivienda", [cat("c1", "Alquiler", "g1")]),
  node("g2", "Transporte", [cat("c2", "Gasolina", "g2")]),
  node("g3", "Ocio", []),
];

type Item = { id: string; catId: string | null };
const group = (items: Item[]) => groupByJar(items, (it) => it.catId, tree);

describe("groupByJar", () => {
  it("resuelve hijo → frasco padre, y el grupo mismo también agrupa", () => {
    const secs = group([
      { id: "a", catId: "c1" }, // hoja → grupo padre g1
      { id: "b", catId: "g2" }, // el grupo mismo → g2
    ]);
    expect(secs.map((s) => s.key)).toEqual(["g1", "g2"]);
    expect(secs.find((s) => s.key === "g1")!.items.map((i) => i.id)).toEqual(["a"]);
    expect(secs.find((s) => s.key === "g2")!.items.map((i) => i.id)).toEqual(["b"]);
  });

  it("sin categoría (o categoría que no resuelve) → 'Generales', y va PRIMERO", () => {
    const secs = group([
      { id: "a", catId: "c1" },
      { id: "sinCat", catId: null },
      { id: "fantasma", catId: "no-existe" },
    ]);
    expect(secs[0]!.key).toBe("generales");
    expect(secs[0]!.name).toBe("Generales");
    expect(secs[0]!.items.map((i) => i.id).sort()).toEqual(["fantasma", "sinCat"]);
  });

  it("NO emite secciones vacías (g3 sin items no aparece) y respeta el orden del tree", () => {
    const secs = group([
      { id: "a", catId: "c2" }, // g2
      { id: "b", catId: "c1" }, // g1
    ]);
    // Orden del tree (g1 antes que g2), no el de inserción; g3 ausente.
    expect(secs.map((s) => s.key)).toEqual(["g1", "g2"]);
  });

  it("no se pierde ni duplica: total agrupado == total de items", () => {
    const items: Item[] = [
      { id: "1", catId: "c1" },
      { id: "2", catId: "g1" },
      { id: "3", catId: "c2" },
      { id: "4", catId: null },
      { id: "5", catId: "no-existe" },
    ];
    const secs = group(items);
    const flat = secs.flatMap((s) => s.items.map((i) => i.id));
    expect(flat.length).toBe(items.length);
    expect(new Set(flat).size).toBe(items.length); // sin duplicados
  });

  it("lista vacía → sin secciones", () => {
    expect(group([])).toEqual([]);
  });
});
