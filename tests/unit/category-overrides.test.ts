import { describe, it, expect } from "vitest";
import {
  resolveCategoryOverrides,
  type OverrideLite,
} from "@/modules/financial-base/engine/category-overrides";

/**
 * Resolución PURA de la personalización por hogar. Cada categoría es {id, parentId}
 * (más campos opcionales que la función conserva intactos).
 */
type Cat = { id: string; parentId: string | null; name?: string };
const c = (id: string, parentId: string | null = null, name?: string): Cat => ({ id, parentId, name });

// Frasco g1 con sobres s1/s2; frasco g2 con sobre s3; un sobre suelto s4 en g1.
const TREE: Cat[] = [
  c("g1", null, "Hogar"),
  c("s1", "g1", "Luz"),
  c("s2", "g1", "Agua"),
  c("g2", null, "Ocio"),
  c("s3", "g2", "Cine"),
];

const ids = (cats: Cat[]) => cats.map((x) => x.id);

describe("resolveCategoryOverrides · identidad", () => {
  it("sin overrides → devuelve la MISMA referencia (cero regresión)", () => {
    const out = resolveCategoryOverrides(TREE, []);
    expect(out).toBe(TREE);
  });

  it("overrides sin efecto (fork null + hidden false) → identidad", () => {
    const overrides: OverrideLite[] = [{ categoryId: "s1", hidden: false, forkId: null }];
    expect(resolveCategoryOverrides(TREE, overrides)).toBe(TREE);
  });
});

describe("resolveCategoryOverrides · ocultar sobre", () => {
  it("un sobre oculto (hoja) se quita; el resto queda", () => {
    const out = resolveCategoryOverrides(TREE, [{ categoryId: "s1", hidden: true, forkId: null }]);
    expect(ids(out)).toEqual(["g1", "s2", "g2", "s3"]);
  });
});

describe("resolveCategoryOverrides · fork sobre", () => {
  it("la base se quita y el fork (ya presente) la reemplaza bajo el mismo frasco", () => {
    // El fork f1 es una categoría del hogar con el mismo parent que la base s1.
    const cats = [...TREE, c("f1", "g1", "Electricidad")];
    const out = resolveCategoryOverrides(cats, [
      { categoryId: "s1", hidden: true, forkId: "f1" },
    ]);
    expect(ids(out)).toEqual(["g1", "s2", "g2", "s3", "f1"]);
    // f1 mantiene su parent (g1); s1 desapareció.
    expect(out.find((x) => x.id === "f1")?.parentId).toBe("g1");
    expect(out.find((x) => x.id === "s1")).toBeUndefined();
  });
});

describe("resolveCategoryOverrides · fork frasco + adopción de hijos", () => {
  it("el frasco base se quita y sus hijos se adoptan al fork (por parent_id)", () => {
    // Fork del frasco g1 → gf (mismo parent null). Los sobres s1/s2 deben re-apuntar a gf.
    const cats = [...TREE, c("gf", null, "Casa")];
    const out = resolveCategoryOverrides(cats, [
      { categoryId: "g1", hidden: true, forkId: "gf" },
    ]);
    expect(out.find((x) => x.id === "g1")).toBeUndefined();
    expect(out.find((x) => x.id === "s1")?.parentId).toBe("gf");
    expect(out.find((x) => x.id === "s2")?.parentId).toBe("gf");
    // g2/s3 intactos; gf presente.
    expect(ids(out).sort()).toEqual(["g2", "gf", "s1", "s2", "s3"]);
  });

  it("no muta la lista original al adoptar (devuelve copias con nuevo parent)", () => {
    const cats = [...TREE, c("gf", null)];
    resolveCategoryOverrides(cats, [{ categoryId: "g1", hidden: true, forkId: "gf" }]);
    // El original s1 conserva su parent.
    expect(cats.find((x) => x.id === "s1")?.parentId).toBe("g1");
  });
});

describe("resolveCategoryOverrides · ocultar frasco + descarte de huérfanos", () => {
  it("frasco oculto SIN fork → se descarta él y sus sobres huérfanos", () => {
    const out = resolveCategoryOverrides(TREE, [{ categoryId: "g1", hidden: true, forkId: null }]);
    // g1, s1, s2 fuera; g2 y s3 quedan.
    expect(ids(out)).toEqual(["g2", "s3"]);
  });
});
