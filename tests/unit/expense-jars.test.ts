import { describe, it, expect } from "vitest";
import { buildExpenseJars, type BudgetLine, type JarEntities, type KeyedTotals } from "@/modules/financial-base/engine/expense-jars";
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
    expect(jar.items).toEqual([{ id: "d1", name: "Tarjeta BAC", sub: "Cuota mensual", amount: "¢45000", delta: undefined, categoryId: null }]);
    expect(jar.cta.href).toBe("/deudas?new=debt");
  });

  it("frasco vinculado budget-aware (Deudas): cuota/pagado/restante por obligación + totales", () => {
    const entities: JarEntities = {
      ...NO_ENTITIES,
      debt: [
        { id: "d1", name: "Tarjeta BAC", sub: "Cuota mensual", amount: 45000 },
        { id: "d2", name: "Préstamo auto", sub: "Cuota mensual", amount: 80000 },
      ],
    };
    const jar = buildExpenseJars({
      tree: [DEUDAS],
      budgetByKey: {},
      realByKey: {},
      entities,
      fmt,
      linkedBudget: {
        debt: {
          // d1 toma la línea derivada (50000, ≠ monto de entidad); d2 cae al monto.
          bySource: { d1: 50000 },
          spentById: { d1: 20000 },
          paymentCategoryId: "cat-deudas",
        },
      },
    })[0]!;
    if (jar.kind !== "linked") throw new Error("linked");
    expect(jar.budgetAware).toBe(true);
    expect(jar.paymentCategoryId).toBe("cat-deudas");

    const d1 = jar.items.find((i) => i.id === "d1")!;
    expect(d1.budget).toBe(50000); // línea derivada, no el monto de la entidad
    expect(d1.spent).toBe(20000);
    expect(d1.remaining).toBe(30000);

    const d2 = jar.items.find((i) => i.id === "d2")!;
    expect(d2.budget).toBe(80000); // fallback al monto de la entidad
    expect(d2.spent).toBe(0);
    expect(d2.remaining).toBe(80000);

    expect(jar.totals).toEqual({ budget: 130000, spent: 20000, remaining: 110000 });
  });

  it("frasco vinculado SIN config de presupuesto: sigue plano (sin budget/spent)", () => {
    const entities: JarEntities = {
      ...NO_ENTITIES,
      debt: [{ id: "d1", name: "Tarjeta BAC", sub: "Cuota mensual", amount: 45000 }],
    };
    const jar = buildExpenseJars({ tree: [DEUDAS], budgetByKey: {}, realByKey: {}, entities, fmt })[0]!;
    if (jar.kind !== "linked") throw new Error("linked");
    expect(jar.budgetAware).toBeUndefined();
    expect(jar.items[0]!.budget).toBeUndefined();
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

  it("Ahorro budget-aware (goal): aporte/aportado/restante por meta + totales, conservando fondos fijos", () => {
    const entities: JarEntities = {
      ...NO_ENTITIES,
      goal: [
        { id: "m1", name: "Casa propia", sub: "Aporte mensual", amount: 100000 },
        { id: "m2", name: "Viaje", sub: "Aporte mensual", amount: 30000 },
      ],
    };
    const jar = buildExpenseJars({
      tree: [AHORRO],
      budgetByKey: {},
      realByKey: {},
      entities,
      fmt,
      linkedBudget: {
        goal: {
          // m1 toma la línea derivada (120000, ≠ monto de entidad); m2 cae al monto.
          bySource: { m1: 120000 },
          spentById: { m1: 50000 },
          paymentCategoryId: "cat-ahorro",
        },
      },
    })[0]!;
    if (jar.kind !== "linked") throw new Error("linked");
    expect(jar.linkedKind).toBe("goal");
    expect(jar.budgetAware).toBe(true);
    expect(jar.paymentCategoryId).toBe("cat-ahorro");

    const m1 = jar.items.find((i) => i.id === "m1")!;
    expect(m1.budget).toBe(120000); // línea derivada, no el monto de la entidad
    expect(m1.spent).toBe(50000);
    expect(m1.remaining).toBe(70000);

    const m2 = jar.items.find((i) => i.id === "m2")!;
    expect(m2.budget).toBe(30000); // fallback al monto de la entidad
    expect(m2.spent).toBe(0);

    expect(jar.totals).toEqual({ budget: 150000, spent: 50000, remaining: 100000 });
    // Los fondos fijos siguen presentes (informativos, el modal los pinta sin barra).
    expect(jar.fixedFunds?.map((f) => f.name)).toEqual(["Fondo de emergencia", "Fondo de paz"]);
  });
});

describe("buildExpenseJars · Ahorro agrupado por categoría (A2)", () => {
  // Grupos referenciados por la categoría de los ahorros.
  const TRANSPORTE: CategoryNode = {
    ...cat({ id: "g_transporte", key: "g_transporte", name: "Transporte", sortOrder: 1 }),
    children: [],
  };
  const SALUD: CategoryNode = {
    ...cat({ id: "g_salud", key: "g_salud", name: "Salud y Bienestar", sortOrder: 2 }),
    children: [cat({ id: "salud_beauty", name: "Belleza", parentId: "g_salud" })],
  };
  const COMIDA: CategoryNode = {
    ...cat({ id: "g_comida", key: "g_comida", name: "Comida", sortOrder: 3 }),
    children: [],
  };
  const tree = [AHORRO, TRANSPORTE, SALUD, COMIDA];

  const goalEntities = (): JarEntities => ({
    ...NO_ENTITIES,
    goal: [
      { id: "g1", name: "Fondo emergencia", sub: "", amount: 50000, categoryId: null },
      { id: "g2", name: "Seguro auto", sub: "", amount: 30000, categoryId: "g_transporte" },
      { id: "g3", name: "Belleza Fernanda", sub: "", amount: 20000, categoryId: "salud_beauty" },
    ],
  });

  function ahorroJar(withBudget: boolean) {
    const jar = buildExpenseJars({
      tree,
      budgetByKey: {},
      realByKey: {},
      entities: goalEntities(),
      fmt,
      linkedBudget: withBudget
        ? { goal: { bySource: {}, spentById: {}, paymentCategoryId: "cat-ahorro" } }
        : undefined,
    }).find((j) => j.kind === "linked" && j.linkedKind === "goal");
    if (!jar || jar.kind !== "linked") throw new Error("ahorro linked jar");
    return jar;
  }

  it("agrupa por el grupo PADRE cuando la categoría es una hoja; 'Generales' va primero", () => {
    const jar = ahorroJar(false);
    expect(jar.sections?.map((s) => s.name)).toEqual(["Generales", "Transporte", "Salud y Bienestar"]);
    expect(jar.sections?.find((s) => s.name === "Generales")?.items.map((i) => i.id)).toEqual(["g1"]);
    expect(jar.sections?.find((s) => s.name === "Transporte")?.items.map((i) => i.id)).toEqual(["g2"]);
    // g3 cuelga de la hoja salud_beauty → resuelve al grupo padre "Salud y Bienestar".
    expect(jar.sections?.find((s) => s.name === "Salud y Bienestar")?.items.map((i) => i.id)).toEqual(["g3"]);
  });

  it("no emite secciones vacías (Comida no tiene ahorros → no aparece)", () => {
    const jar = ahorroJar(false);
    expect(jar.sections?.map((s) => s.name)).not.toContain("Comida");
  });

  it("categoría inexistente en el árbol cae en 'Generales'", () => {
    const jar = buildExpenseJars({
      tree,
      budgetByKey: {},
      realByKey: {},
      entities: { ...NO_ENTITIES, goal: [{ id: "gx", name: "Huérfano", sub: "", amount: 1, categoryId: "borrada" }] },
      fmt,
    }).find((j) => j.kind === "linked" && j.linkedKind === "goal")!;
    if (jar.kind !== "linked") throw new Error("linked");
    expect(jar.sections?.map((s) => s.name)).toEqual(["Generales"]);
    expect(jar.sections?.[0]!.items.map((i) => i.id)).toEqual(["gx"]);
  });

  it("agrupación es solo visual: items (plano) y totales NO cambian", () => {
    const jar = ahorroJar(true);
    // items plano conserva las 3 metas.
    expect(jar.items.map((i) => i.id).sort()).toEqual(["g1", "g2", "g3"]);
    // totales = suma de los aportes (fallback al monto de la entidad), sin doble conteo.
    expect(jar.totals).toEqual({ budget: 100000, spent: 0, remaining: 100000 });
    // Cada item aparece exactamente una vez entre todas las secciones.
    const idsInSections = jar.sections!.flatMap((s) => s.items.map((i) => i.id)).sort();
    expect(idsInSections).toEqual(["g1", "g2", "g3"]);
  });
});

describe("buildExpenseJars · Ahorro dedup de fondos fijos sugeridos", () => {
  const goalJar = (goals: JarEntities["goal"]) => {
    const jar = buildExpenseJars({
      tree: [AHORRO],
      budgetByKey: {},
      realByKey: {},
      entities: { ...NO_ENTITIES, goal: goals },
      fmt,
    }).find((j) => j.kind === "linked" && j.linkedKind === "goal");
    if (!jar || jar.kind !== "linked") throw new Error("ahorro linked jar");
    return jar;
  };

  it("sin fondos creados → sugiere los 2 (Emergencia y Paz)", () => {
    const jar = goalJar([]);
    expect(jar.fixedFunds?.map((f) => f.name)).toEqual(["Fondo de emergencia", "Fondo de paz"]);
  });

  it("con 'Fondo de paz' creado (goal_type) → solo sugiere Emergencia", () => {
    const jar = goalJar([
      { id: "gp", name: "Mi paz", sub: "", amount: 0, goalType: "defensa:fondo_paz" },
    ]);
    expect(jar.fixedFunds?.map((f) => f.name)).toEqual(["Fondo de emergencia"]);
  });

  it("con ambos creados → fixedFunds vacío (no se renderiza la sección)", () => {
    const jar = goalJar([
      { id: "ge", name: "X", sub: "", amount: 0, goalType: "defensa:fondo_emergencia" },
      { id: "gp", name: "Y", sub: "", amount: 0, goalType: "defensa:fondo_paz" },
    ]);
    expect(jar.fixedFunds).toEqual([]);
  });

  it("fallback por nombre (sin goal_type): 'Fondo de Emergencia' oculta la sugerencia", () => {
    const jar = goalJar([
      { id: "gn", name: "  Fondo de Emergencia ", sub: "", amount: 0, goalType: null },
    ]);
    expect(jar.fixedFunds?.map((f) => f.name)).toEqual(["Fondo de paz"]);
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

describe('buildExpenseJars · frasco "Por reasignar" (huérfanos)', () => {
  const line = (over: Partial<BudgetLine>): BudgetLine => ({
    id: over.id ?? "b1",
    name: over.name ?? "Línea",
    amount: over.amount ?? 0,
    currency: over.currency ?? "CRC",
    categoryId: over.categoryId ?? null,
    sourceKind: over.sourceKind,
    sourceId: over.sourceId,
  });

  const orphanJar = (jars: ReturnType<typeof buildExpenseJars>) =>
    jars.find((j) => j.kind === "orphan");

  it("(a) línea sin categoría → huérfana, motivo 'sin_categoria'", () => {
    const jars = buildExpenseJars({
      tree: [VIVIENDA], budgetByKey: {}, realByKey: {}, entities: NO_ENTITIES, fmt,
      budgetItems: [line({ id: "b1", name: "Suelta", amount: 500, categoryId: null })],
    });
    const orphan = orphanJar(jars);
    if (orphan?.kind !== "orphan") throw new Error("debe haber frasco huérfano");
    expect(orphan.name).toBe("Por reasignar");
    expect(orphan.items).toHaveLength(1);
    expect(orphan.items[0]!.reason).toBe("sin_categoria");
    expect(orphan.total).toBe(500);
  });

  it("(b) línea de categoría oculta (fuera del árbol) → huérfana, motivo 'categoria_oculta'", () => {
    const jars = buildExpenseJars({
      tree: [VIVIENDA], budgetByKey: {}, realByKey: {}, entities: NO_ENTITIES, fmt,
      budgetItems: [line({ id: "b2", name: "Netflix", amount: 1840, categoryId: "cat_borrada" })],
      hiddenCategoryIds: ["cat_borrada"],
    });
    const orphan = orphanJar(jars);
    if (orphan?.kind !== "orphan") throw new Error("debe haber frasco huérfano");
    expect(orphan.items[0]!.reason).toBe("categoria_oculta");
    expect(orphan.total).toBe(1840);
  });

  it("(c) categoría de sistema NO favorita CON presupuesto → se pinta en su frasco, NO es huérfana", () => {
    const jars = buildExpenseJars({
      tree: [VIVIENDA],
      budgetByKey: { viv_old: { label: "Servicios y hogar", value: 700 } },
      realByKey: {}, entities: NO_ENTITIES, fmt,
      budgetItems: [line({ id: "b3", name: "Servicios y hogar", amount: 700, categoryId: "viv_old" })],
    });
    const viv = jars[0]!;
    if (viv.kind !== "normal") throw new Error("debe ser normal");
    expect(viv.envelopes.map((e) => e.id)).toContain("viv_old");
    expect(orphanJar(jars)).toBeUndefined();
  });

  it("línea derivada de una meta (categoryId null + sourceKind) NO es huérfana: se pinta por source", () => {
    const jars = buildExpenseJars({
      tree: [AHORRO], budgetByKey: {}, realByKey: {}, fmt,
      entities: { ...NO_ENTITIES, goal: [{ id: "goal_1", name: "Fondo", sub: "", amount: 300 }] },
      linkedBudget: { goal: { bySource: { goal_1: 300 }, spentById: {}, paymentCategoryId: "g_aho" } },
      budgetItems: [line({ id: "b4", name: "Fondo", amount: 300, categoryId: null, sourceKind: "goal", sourceId: "goal_1" })],
    });
    expect(orphanJar(jars)).toBeUndefined();
  });

  it("(d) INVARIANTE: suma(visible) + suma(huérfanos) === suma(todos los budget_items de gasto)", () => {
    const budgetItems: BudgetLine[] = [
      line({ id: "b1", name: "Alquiler", amount: 3000, categoryId: "viv_alq" }),
      line({ id: "b2", name: "Servicios general", amount: 1200, categoryId: "viv_serv" }),
      line({ id: "b3", name: "Servicios y hogar", amount: 700, categoryId: "viv_old" }), // system no-favorita CON plata
      line({ id: "b4", name: "Suelta", amount: 500, categoryId: null }), // huérfana
      line({ id: "b5", name: "Netflix", amount: 1840, categoryId: "cat_borrada" }), // huérfana
      line({ id: "b6", name: "Aporte meta", amount: 300, categoryId: null, sourceKind: "goal", sourceId: "goal_1" }),
    ];
    const budgetByKey: KeyedTotals = {
      viv_alq: { label: "Alquiler", value: 3000 },
      viv_serv: { label: "Servicios general", value: 1200 },
      viv_old: { label: "Servicios y hogar", value: 700 },
    };

    const jars = buildExpenseJars({
      tree: [VIVIENDA, AHORRO], budgetByKey, realByKey: {}, fmt,
      entities: { ...NO_ENTITIES, goal: [{ id: "goal_1", name: "Fondo", sub: "", amount: 300 }] },
      linkedBudget: { goal: { bySource: { goal_1: 300 }, spentById: {}, paymentCategoryId: "g_aho" } },
      budgetItems,
      hiddenCategoryIds: ["cat_borrada"],
    });

    let visible = 0;
    for (const j of jars) {
      if (j.kind === "normal") visible += j.envelopes.reduce((t, e) => t + e.budget, 0);
      else if (j.kind === "linked") visible += j.totals?.budget ?? 0;
    }
    const orphans = jars.reduce((t, j) => (j.kind === "orphan" ? t + j.total : t), 0);
    const total = budgetItems.reduce((t, it) => t + it.amount, 0);

    expect(orphans).toBe(2340); // los $1.840 fantasma + la línea suelta
    expect(visible + orphans).toBe(total);
  });
});

describe("ciclo de reasignación (G2)", () => {
  const base = (categoryId: string | null): BudgetLine[] => [
    { id: "b1", name: "Alquiler", amount: 3000, currency: "CRC", categoryId: "viv_alq" },
    { id: "b2", name: "Netflix", amount: 1840, currency: "CRC", categoryId },
  ];
  const budgetByKey = (extra?: KeyedTotals): KeyedTotals => ({
    viv_alq: { label: "Alquiler", value: 3000 },
    ...extra,
  });

  it("reasignar saca la línea de 'Por reasignar', la suma a su frasco y NO cambia el titular", () => {
    // Antes: "Netflix" apunta a una categoría oculta → cae en el bucket.
    const antes = buildExpenseJars({
      tree: [VIVIENDA], budgetByKey: budgetByKey(), realByKey: {}, entities: NO_ENTITIES, fmt,
      budgetItems: base("cat_oculta"), hiddenCategoryIds: ["cat_oculta"],
    });
    const orphanAntes = antes.find((j) => j.kind === "orphan");
    if (orphanAntes?.kind !== "orphan") throw new Error("debía haber huérfano");
    expect(orphanAntes.total).toBe(1840);
    const vivAntes = antes[0]!;
    if (vivAntes.kind !== "normal") throw new Error("normal");
    const visibleAntes = vivAntes.envelopes.reduce((t, e) => t + e.budget, 0);

    // Después: la acción movió category_id a "viv_serv" (el presupuesto por
    // categoría se recalcula en el server; acá se simula el mismo resultado).
    const despues = buildExpenseJars({
      tree: [VIVIENDA],
      budgetByKey: budgetByKey({ viv_serv: { label: "Servicios general", value: 1840 } }),
      realByKey: {}, entities: NO_ENTITIES, fmt,
      budgetItems: base("viv_serv"), hiddenCategoryIds: ["cat_oculta"],
    });
    const vivDespues = despues[0]!;
    if (vivDespues.kind !== "normal") throw new Error("normal");
    const visibleDespues = vivDespues.envelopes.reduce((t, e) => t + e.budget, 0);

    // 1. el bucket desaparece
    expect(despues.find((j) => j.kind === "orphan")).toBeUndefined();
    // 2. la línea ahora se ve en su frasco
    expect(vivDespues.envelopes.find((e) => e.id === "viv_serv")?.budget).toBe(1840);
    // 3. el titular NO cambia: solo se movió de lugar
    expect(visibleAntes + orphanAntes.total).toBe(visibleDespues);
    expect(visibleDespues).toBe(4840);
  });
});
