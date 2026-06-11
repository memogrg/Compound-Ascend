import { describe, it, expect } from "vitest";
import { buildExpenseJars, type JarEntities, type KeyedTotals } from "@/modules/financial-base/engine/expense-jars";
import { mergeSuggestions, GROUP_SUGGESTIONS } from "@/modules/financial-base/engine/expense-suggestions";
import type { Category, CategoryNode } from "@/modules/financial-base/services/categories-service";

function cat(over: Partial<Category>): Category {
  return {
    id: over.id ?? "x",
    key: over.key ?? null,
    name: over.name ?? "",
    defaultNature: null,
    parentId: over.parentId ?? null,
    icon: over.icon ?? null,
    color: over.color ?? null,
    isFavorite: over.isFavorite ?? false,
    isActive: true,
    isSystem: over.isSystem ?? true,
    categoryType: "expense",
    sortOrder: over.sortOrder ?? 0,
    linkedKind: over.linkedKind ?? null,
  };
}

const fmt = (n: number) => `¢${n}`;
const NO_ENTITIES: JarEntities = { holding: [], rental: [], debt: [], policy: [], goal: [] };

// Grupo normal con: 2 hojas favoritas (sobres), 1 hoja de sistema no-favorita
// (sugerencia), 1 hoja del usuario (sobre aunque no sea favorita).
const VIVIENDA: CategoryNode = {
  ...cat({ id: "g_viv", key: "g_vivienda", name: "Vivienda", color: "var(--c-expense)" }),
  children: [
    cat({ id: "viv_serv", key: "viv_servicios", name: "Servicios general", isFavorite: true, parentId: "g_viv" }),
    cat({ id: "viv_alq", key: "viv_alquiler", name: "Alquiler", isFavorite: true, parentId: "g_viv" }),
    cat({ id: "viv_old", key: "servicios_hogar", name: "Servicios y hogar", isFavorite: false, parentId: "g_viv" }),
    cat({ id: "viv_user", key: null, name: "Piscina", isFavorite: false, isSystem: false, parentId: "g_viv" }),
  ],
};

const DEUDAS: CategoryNode = {
  ...cat({ id: "g_deu", key: "g_deudas", name: "Deudas", color: "var(--warn)" }),
  children: [cat({ id: "deuda_tarjeta", key: "deuda_tarjeta", name: "Tarjeta de crédito", linkedKind: "debt", parentId: "g_deu" })],
};

const AHORRO: CategoryNode = {
  ...cat({ id: "g_aho", key: "g_ahorro_lp", name: "Ahorro a Largo Plazo", color: "var(--pos)" }),
  children: [],
};

describe("buildExpenseJars (Fase frascos)", () => {
  it("frasco normal: sobres = favoritas + propias del usuario; sugerencias = no-favoritas ∪ benchmark", () => {
    const budget: KeyedTotals = { viv_serv: { label: "Servicios general", value: 100 } };
    const real: KeyedTotals = { viv_serv: { label: "Servicios general", value: 30 } };
    const jars = buildExpenseJars({ tree: [VIVIENDA], budgetByKey: budget, realByKey: real, entities: NO_ENTITIES, fmt });
    const viv = jars[0]!;
    if (viv.kind !== "normal") throw new Error("debe ser normal");

    expect(viv.envelopes.map((e) => e.name)).toEqual(["Servicios general", "Alquiler", "Piscina"]);
    const serv = viv.envelopes.find((e) => e.id === "viv_serv")!;
    expect(serv.budget).toBe(100);
    expect(serv.spent).toBe(30);

    // "Servicios y hogar" (no-favorita) entra como sugerencia; el benchmark también.
    expect(viv.suggestions).toContain("Servicios y hogar");
    expect(viv.suggestions).toContain("Agua"); // de GROUP_SUGGESTIONS.g_vivienda
    // ninguna sugerencia repite un sobre existente
    expect(viv.suggestions).not.toContain("Servicios general");
    expect(viv.suggestions).not.toContain("Piscina");
  });

  it("sobre '(general)' aparece si hay gasto/plan categorizado al grupo", () => {
    const jars = buildExpenseJars({
      tree: [VIVIENDA],
      budgetByKey: {},
      realByKey: { g_viv: { label: "Vivienda", value: 50 } },
      entities: NO_ENTITIES,
      fmt,
    });
    const viv = jars[0]!;
    if (viv.kind !== "normal") throw new Error("normal");
    expect(viv.envelopes[0]!.name).toBe("Vivienda (general)");
    expect(viv.envelopes[0]!.spent).toBe(50);
  });

  it("decremento: subir el real de un sobre sube su 'spent' (y baja el restante budget-spent)", () => {
    const budget: KeyedTotals = { viv_serv: { label: "Servicios general", value: 100 } };
    const before = buildExpenseJars({ tree: [VIVIENDA], budgetByKey: budget, realByKey: {}, entities: NO_ENTITIES, fmt })[0]!;
    const after = buildExpenseJars({ tree: [VIVIENDA], budgetByKey: budget, realByKey: { viv_serv: { label: "Servicios general", value: 40 } }, entities: NO_ENTITIES, fmt })[0]!;
    if (before.kind !== "normal" || after.kind !== "normal") throw new Error("normal");
    const b = before.envelopes.find((e) => e.id === "viv_serv")!;
    const a = after.envelopes.find((e) => e.id === "viv_serv")!;
    expect(b.spent).toBe(0);
    expect(a.spent).toBe(40);
    expect(a.budget - a.spent).toBe(60); // restante baja de 100 a 60
  });

  it("frasco vinculado: mapea entidades reales con monto formateado", () => {
    const entities: JarEntities = {
      ...NO_ENTITIES,
      debt: [{ id: "d1", name: "Tarjeta BAC", sub: "Cuota mensual", amount: 45000 }],
    };
    const jar = buildExpenseJars({ tree: [DEUDAS], budgetByKey: {}, realByKey: {}, entities, fmt })[0]!;
    if (jar.kind !== "linked") throw new Error("linked");
    expect(jar.linkedKind).toBe("debt");
    expect(jar.items).toEqual([{ id: "d1", name: "Tarjeta BAC", sub: "Cuota mensual", amount: "¢45000", delta: undefined }]);
    expect(jar.cta.href).toBe("/deudas?new=debt");
  });

  it("frasco vinculado vacío: texto exacto del diseño", () => {
    const jar = buildExpenseJars({ tree: [DEUDAS], budgetByKey: {}, realByKey: {}, entities: NO_ENTITIES, fmt })[0]!;
    if (jar.kind !== "linked") throw new Error("linked");
    expect(jar.emptyText).toBe("No hay Deudas Mapeadas");
  });

  it("Ahorro: incluye fondos fijos (Emergencia/Paz) además de las metas reales", () => {
    const jar = buildExpenseJars({ tree: [AHORRO], budgetByKey: {}, realByKey: {}, entities: NO_ENTITIES, fmt })[0]!;
    if (jar.kind !== "linked") throw new Error("linked");
    expect(jar.fixedFunds?.map((f) => f.name)).toEqual(["Fondo de emergencia", "Fondo de paz"]);
    expect(jar.emptyText).toBe("No existen Objetivos activos mapeados");
  });
});

describe("mergeSuggestions", () => {
  it("deduplica (case-insensitive) y excluye los sobres existentes", () => {
    const out = mergeSuggestions({
      groupKey: "g_alimentacion",
      nonFavoriteLeafNames: ["Café", "Restaurantes"],
      envelopeNames: ["Restaurantes", "Supermercados"],
    });
    expect(out).toContain("Café");
    expect(out).not.toContain("Restaurantes"); // ya es sobre
    // benchmark fusionado, sin duplicar "Café" (está en GROUP_SUGGESTIONS.g_alimentacion)
    expect(out.filter((s) => s.toLowerCase() === "café")).toHaveLength(1);
    expect(GROUP_SUGGESTIONS.g_alimentacion).toContain("Café");
  });
});
