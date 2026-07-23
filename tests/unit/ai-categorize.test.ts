import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado compartido por los mocks (provider IA + cliente Supabase + categorías).
const h = vi.hoisted(() => ({
  provider: null as { chat: ReturnType<typeof vi.fn> } | null,
  aiText: '{"categoryId":null,"confidence":0}',
  cacheRows: [] as Record<string, unknown>[],
  historyRows: [] as Record<string, unknown>[],
  upsertSpy: vi.fn(),
  cats: [] as Record<string, unknown>[],
  // Filas single para el fallback determinista (validateLeafForKind / cache single).
  catRow: null as Record<string, unknown> | null,
  cacheSingle: null as Record<string, unknown> | null,
  // Totales por category_id (mes actual) para el filtro de sobres adoptados en listSobresForKind.
  budgetByKey: {} as Record<string, { value: number }>,
  realByKey: {} as Record<string, { value: number }>,
}));

vi.mock("server-only", () => ({}));
// listSobresForKind("gasto") une los configurados con los presupuestados/usados del mes.
vi.mock("@/modules/financial-base/services/budget-service", () => ({
  getBudgetTotals: async () => ({ expenseByKey: h.budgetByKey }),
}));
vi.mock("@/modules/financial-base/services/transaction-service", () => ({
  getRealTotals: async () => ({ expenseByKey: h.realByKey }),
}));
vi.mock("@/lib/ai/providers/gemini", () => ({ createGeminiProvider: () => h.provider }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const data = table === "transactions" ? h.historyRows : h.cacheRows;
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        not: () => b,
        is: () => b,
        order: () => b,
        limit: () => b,
        // resolveAutoCategory: single de expense_categories (validación de hoja) o de la caché.
        maybeSingle: () =>
          Promise.resolve({
            data: table === "expense_categories" ? h.catRow : h.cacheSingle,
            error: null,
          }),
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data, error: null }).then(r, j),
        upsert: (payload: Record<string, unknown>) => {
          h.upsertSpy(payload);
          return Promise.resolve({ error: null });
        },
      };
      return b;
    },
  }),
}));
vi.mock("@/modules/financial-base/services/categories-service", () => ({
  listCategories: async () => h.cats,
  // Sin overrides en estos tests: la resolución es identidad.
  resolveOverrideTarget: async (_sb: unknown, _scope: unknown, id: string) => id,
}));

import {
  suggestSobre,
  getSuggestionsFor,
  resolveAutoCategory,
  suggestSobreForChat,
  listSobresForKind,
  AUTO_ASSIGN_MIN_CONFIDENCE,
  MAX_NEW_SUGGESTION_CALLS,
} from "@/modules/financial-base/services/ai-categorize";
import {
  selectableSobresByFrasco,
  isConfiguredSobre,
  filterConfiguredSobreTree,
} from "@/modules/financial-base/engine/classify";

const cat = (over: Record<string, unknown>) => ({
  id: "c",
  name: "X",
  parentId: null,
  isActive: true,
  categoryType: "expense",
  ...over,
});

const fakeProvider = () => ({
  chat: vi.fn(async () => ({ text: h.aiText, tokensIn: 0, tokensOut: 0 })),
});

beforeEach(() => {
  h.provider = fakeProvider();
  h.aiText = '{"categoryId":null,"confidence":0}';
  h.cacheRows = [];
  h.historyRows = [];
  h.catRow = null;
  h.cacheSingle = null;
  h.budgetByKey = {};
  h.realByKey = {};
  h.upsertSpy.mockClear();
  h.cats = [
    cat({ id: "c-comida", name: "Comida", categoryType: "expense" }),
    cat({ id: "c-salario", name: "Salario", categoryType: "income" }),
  ];
});

// ---------------------------------------------------------------------------
// suggestSobre
// ---------------------------------------------------------------------------
describe("suggestSobre", () => {
  it("JSON válido con id en la lista → categoryId + confidence", async () => {
    h.aiText = '{"categoryId":"c-comida","confidence":0.9}';
    const r = await suggestSobre("Starbucks", [{ id: "c-comida", name: "Comida" }]);
    expect(r).toEqual({ categoryId: "c-comida", confidence: 0.9 });
  });

  it("categoryId fuera de la lista → null (no inventa sobres)", async () => {
    h.aiText = '{"categoryId":"c-inexistente","confidence":0.8}';
    const r = await suggestSobre("Starbucks", [{ id: "c-comida", name: "Comida" }]);
    expect(r.categoryId).toBeNull();
  });

  it("respuesta no-JSON → null", async () => {
    h.aiText = "no tengo idea";
    const r = await suggestSobre("Starbucks", [{ id: "c-comida", name: "Comida" }]);
    expect(r).toEqual({ categoryId: null, confidence: 0 });
  });

  it("IA no configurada (provider null) → null, sin llamar", async () => {
    h.provider = null;
    const r = await suggestSobre("Starbucks", [{ id: "c-comida", name: "Comida" }]);
    expect(r).toEqual({ categoryId: null, confidence: 0 });
  });
});

// ---------------------------------------------------------------------------
// getSuggestionsFor
// ---------------------------------------------------------------------------
describe("getSuggestionsFor", () => {
  it("cache hit → NO llama a la IA ni reescribe el caché", async () => {
    h.cacheRows = [{ merchant_norm: "starbucks", category_id: "c-comida", confidence: 0.9 }];
    const res = await getSuggestionsFor([{ id: "t1", merchant: "Starbucks", kind: "gasto" }]);
    expect(res.get("t1")).toEqual({ categoryId: "c-comida", confidence: 0.9, source: "cache" });
    expect(h.provider!.chat).not.toHaveBeenCalled();
    expect(h.upsertSpy).not.toHaveBeenCalled();
  });

  it("miss → llama a la IA una vez y guarda en caché", async () => {
    h.aiText = '{"categoryId":"c-comida","confidence":0.8}';
    const res = await getSuggestionsFor([{ id: "t1", merchant: "Starbucks", kind: "gasto" }]);
    expect(h.provider!.chat).toHaveBeenCalledTimes(1);
    expect(res.get("t1")).toEqual({ categoryId: "c-comida", confidence: 0.8, source: "ia" });
    const payload = h.upsertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.user_id).toBe("u1");
    expect(payload.merchant_norm).toBe("starbucks");
    expect(payload.category_id).toBe("c-comida");
  });

  it("omite items sin comercio", async () => {
    const res = await getSuggestionsFor([{ id: "t1", merchant: null, kind: "gasto" }]);
    expect(res.size).toBe(0);
    expect(h.provider!.chat).not.toHaveBeenCalled();
  });

  it("respeta el tope de llamadas nuevas por carga", async () => {
    h.aiText = '{"categoryId":"c-comida","confidence":0.7}';
    const items = Array.from({ length: MAX_NEW_SUGGESTION_CALLS + 4 }, (_, i) => ({
      id: `t${i}`,
      merchant: `Comercio ${i}`, // todos distintos → todos miss
      kind: "gasto" as const,
    }));
    await getSuggestionsFor(items);
    expect(h.provider!.chat).toHaveBeenCalledTimes(MAX_NEW_SUGGESTION_CALLS);
  });
});

// ---------------------------------------------------------------------------
// getSuggestionsFor · capa de HISTORIAL (precede a cache/IA)
// ---------------------------------------------------------------------------
describe("getSuggestionsFor · historial del usuario", () => {
  it("historial gana: usa la categoría del comercio y NO llama a la IA ni mira cache", async () => {
    h.historyRows = [{ merchant_or_source: "Starbucks", description: null, category_id: "c-comida", kind: "gasto" }];
    h.cacheRows = [{ merchant_norm: "starbucks", category_id: "c-salario", confidence: 0.9 }]; // no debería usarse
    const res = await getSuggestionsFor([{ id: "t1", merchant: "Starbucks", kind: "gasto" }]);
    expect(res.get("t1")).toEqual({ categoryId: "c-comida", confidence: 0.95, source: "historial" });
    expect(h.provider!.chat).not.toHaveBeenCalled();
  });

  it("dominante = más frecuente; desempate por más reciente", async () => {
    // 'c-comida' aparece 2 veces, 'c-salario' 1 → dominante c-comida.
    h.historyRows = [
      { merchant_or_source: "Auto Mercado", description: null, category_id: "c-comida", kind: "gasto" },
      { merchant_or_source: "Auto Mercado", description: null, category_id: "c-comida", kind: "gasto" },
      { merchant_or_source: "Auto Mercado", description: null, category_id: "c-salario", kind: "gasto" },
    ];
    const res = await getSuggestionsFor([{ id: "t1", merchant: "Auto Mercado", kind: "gasto" }]);
    expect(res.get("t1")?.categoryId).toBe("c-comida");
    expect(res.get("t1")?.source).toBe("historial");
  });

  it("kind mismatch: categoría de otra naturaleza → ignora historial y cae a cache/IA", async () => {
    // El historial del comercio es 'c-salario' (income) pero el item es un GASTO → no aplica.
    h.historyRows = [{ merchant_or_source: "Freelance", description: null, category_id: "c-salario", kind: "ingreso" }];
    h.cacheRows = [{ merchant_norm: "freelance", category_id: "c-comida", confidence: 0.7 }];
    const res = await getSuggestionsFor([{ id: "t1", merchant: "Freelance", kind: "gasto" }]);
    expect(res.get("t1")).toEqual({ categoryId: "c-comida", confidence: 0.7, source: "cache" }); // cae a cache
    expect(h.provider!.chat).not.toHaveBeenCalled();
  });

  it("sin historial → flujo actual intacto (cae a IA)", async () => {
    h.historyRows = [];
    h.aiText = '{"categoryId":"c-comida","confidence":0.8}';
    const res = await getSuggestionsFor([{ id: "t1", merchant: "Nuevo Comercio", kind: "gasto" }]);
    expect(res.get("t1")).toEqual({ categoryId: "c-comida", confidence: 0.8, source: "ia" });
    expect(h.provider!.chat).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// resolveAutoCategory (auto-asignar al registrar, SIN IA en vivo)
// ---------------------------------------------------------------------------
type FakeCfg = {
  historyRows?: Record<string, unknown>[];
  cacheRow?: Record<string, unknown> | null;
  catRow?: Record<string, unknown> | null;
  childCount?: number;
};

// Fake del cliente Supabase: builder por tabla. transactions→historyRows (await),
// merchant_suggestion_cache→cacheRow (maybeSingle), expense_categories→catRow (maybeSingle) o
// childCount (count/head). Sirve para probar resolveAutoCategory pasándoselo directo.
function fakeClient(cfg: FakeCfg) {
  const builder = (thenResult: unknown, single: unknown) => {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: () => b,
      not: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(single),
      then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
        Promise.resolve(thenResult).then(r, j),
    };
    return b;
  };
  return {
    from: (table: string) => {
      if (table === "transactions") return builder({ data: cfg.historyRows ?? [], error: null }, { data: null });
      if (table === "merchant_suggestion_cache")
        return builder({ data: [], error: null }, { data: cfg.cacheRow ?? null, error: null });
      if (table === "expense_categories")
        return builder({ count: cfg.childCount ?? 0, error: null }, { data: cfg.catRow ?? null, error: null });
      return builder({ data: [], error: null }, { data: null });
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asClient = (c: ReturnType<typeof fakeClient>) => c as any;
const EXPENSE_LEAF = { category_type: "expense", is_active: true };

describe("resolveAutoCategory · auto-asignar sin IA", () => {
  it("historial ≥ umbral → asigna (source historial)", async () => {
    const supabase = fakeClient({
      historyRows: [{ merchant_or_source: "Starbucks", description: null, category_id: "c-comida", kind: "gasto" }],
      catRow: EXPENSE_LEAF,
      childCount: 0,
    });
    const r = await resolveAutoCategory({ supabase: asClient(supabase), merchant: "Starbucks", kind: "gasto" });
    expect(r).toEqual({ categoryId: "c-comida", source: "historial" });
  });

  it("caché ≥ 0.9 (sin historial) → asigna (source cache)", async () => {
    const supabase = fakeClient({
      historyRows: [],
      cacheRow: { category_id: "c-comida", confidence: 0.92 },
      catRow: EXPENSE_LEAF,
      childCount: 0,
    });
    const r = await resolveAutoCategory({ supabase: asClient(supabase), userId: "u1", merchant: "Starbucks", kind: "gasto" });
    expect(r).toEqual({ categoryId: "c-comida", source: "cache" });
  });

  it("caché < 0.9 → null (no auto-asigna)", async () => {
    const supabase = fakeClient({ historyRows: [], cacheRow: { category_id: "c-comida", confidence: 0.7 }, catRow: EXPENSE_LEAF });
    const r = await resolveAutoCategory({ supabase: asClient(supabase), merchant: "Starbucks", kind: "gasto" });
    expect(r).toBeNull();
  });

  it("kind mismatch (categoría de otra naturaleza) → null", async () => {
    const supabase = fakeClient({
      historyRows: [{ merchant_or_source: "Freelance", description: null, category_id: "c-salario", kind: "ingreso" }],
      catRow: { category_type: "income", is_active: true },
      childCount: 0,
    });
    const r = await resolveAutoCategory({ supabase: asClient(supabase), merchant: "Freelance", kind: "gasto" });
    expect(r).toBeNull();
  });

  it("categoría que es PADRE de otra activa (no hoja) → null", async () => {
    const supabase = fakeClient({
      historyRows: [{ merchant_or_source: "Hogar", description: null, category_id: "c-hogar", kind: "gasto" }],
      catRow: EXPENSE_LEAF,
      childCount: 2, // tiene hijas activas → no es hoja
    });
    const r = await resolveAutoCategory({ supabase: asClient(supabase), merchant: "Hogar", kind: "gasto" });
    expect(r).toBeNull();
  });

  it("sin señales (ni historial ni caché) → null", async () => {
    const supabase = fakeClient({ historyRows: [], cacheRow: null });
    const r = await resolveAutoCategory({ supabase: asClient(supabase), merchant: "Desconocido", kind: "gasto" });
    expect(r).toBeNull();
  });

  it("nunca lanza: si el cliente falla, devuelve null", async () => {
    const throwing = { from: () => { throw new Error("db down"); } };
    const r = await resolveAutoCategory({ supabase: asClient(throwing as never), merchant: "X", kind: "gasto" });
    expect(r).toBeNull();
  });

  it("umbral exportado es 0.9", () => {
    expect(AUTO_ASSIGN_MIN_CONFIDENCE).toBe(0.9);
  });
});

// ---------------------------------------------------------------------------
// selectableSobresByFrasco (puro): hoja + su frasco (padre) para "Frasco › Sobre"
// ---------------------------------------------------------------------------
describe("selectableSobresByFrasco", () => {
  const mk = (over: Record<string, unknown>) => ({
    id: "x", key: null, name: "X", defaultNature: null, parentId: null, icon: null, color: null,
    isFavorite: false, isEssential: false, isActive: true, isSystem: true, categoryType: "expense",
    sortOrder: 0, linkedKind: null, ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it("cada sobre HOJA lleva el nombre de su frasco (padre)", () => {
    const cats = [
      mk({ id: "f-alim", name: "Alimentación" }), // frasco (padre) → no es hoja
      mk({ id: "s-rest", name: "Restaurantes", parentId: "f-alim" }),
      mk({ id: "s-super", name: "Supermercado", parentId: "f-alim" }),
    ];
    const out = selectableSobresByFrasco(cats);
    expect(out).toEqual([
      { id: "s-rest", sobre: "Restaurantes", frasco: "Alimentación", categoryType: "expense" },
      { id: "s-super", sobre: "Supermercado", frasco: "Alimentación", categoryType: "expense" },
    ]);
  });

  it("hoja sin padre → frasco null; excluye inactivas y 'transfer'", () => {
    const cats = [
      mk({ id: "s-suelto", name: "Suelto", parentId: null }),
      mk({ id: "s-off", name: "Inactivo", isActive: false }),
      mk({ id: "s-tx", name: "Transfer", categoryType: "transfer" }),
    ];
    const out = selectableSobresByFrasco(cats);
    expect(out).toEqual([
      { id: "s-suelto", sobre: "Suelto", frasco: null, categoryType: "expense" },
    ]);
  });

  it("ordena por frasco y luego por sobre (ignora acentos/mayúsculas); sin-frasco al final", () => {
    // Entrada desordenada a propósito.
    const cats = [
      mk({ id: "f-trans", name: "Transporte" }),
      mk({ id: "f-alim", name: "Alimentación" }),
      mk({ id: "s-veh", name: "Vehículo", parentId: "f-trans" }),
      mk({ id: "s-super", name: "supermercado", parentId: "f-alim" }), // minúscula → va tras "Restaurantes"
      mk({ id: "s-rest", name: "Restaurantes", parentId: "f-alim" }),
      mk({ id: "s-suelto", name: "Suelto", parentId: null }), // sin frasco → al final
      mk({ id: "s-bus", name: "Autobús", parentId: "f-trans" }),
    ];
    const out = selectableSobresByFrasco(cats).map((s) => `${s.frasco ?? "—"} › ${s.sobre}`);
    expect(out).toEqual([
      "Alimentación › Restaurantes",
      "Alimentación › supermercado",
      "Transporte › Autobús",
      "Transporte › Vehículo",
      "— › Suelto",
    ]);
  });
});

// ---------------------------------------------------------------------------
// isConfiguredSobre + filterConfiguredSobreTree (predicado puro para el composer)
// ---------------------------------------------------------------------------
describe("isConfiguredSobre / filterConfiguredSobreTree", () => {
  it("configurado = favorito adoptado O creado por el usuario (no-system)", () => {
    expect(isConfiguredSobre({ isFavorite: true, isSystem: true })).toBe(true); // favorito de fábrica
    expect(isConfiguredSobre({ isFavorite: false, isSystem: false })).toBe(true); // propio
    expect(isConfiguredSobre({ isFavorite: false, isSystem: true })).toBe(false); // plantilla sin adoptar
  });

  it("filtra hojas a configuradas ∪ adoptadas; conserva los grupos (frascos)", () => {
    const node = (over: Record<string, unknown>) => ({
      id: "x", key: null, name: "X", defaultNature: null, parentId: null, icon: null, color: null,
      isFavorite: false, isEssential: false, isActive: true, isSystem: true, categoryType: "expense",
      sortOrder: 0, linkedKind: null, ...over,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    const tree = [
      {
        ...node({ id: "g", name: "Alimentación" }),
        children: [
          node({ id: "s-rest", name: "Restaurantes", parentId: "g", isFavorite: true }),
          node({ id: "s-deli", name: "Delivery", parentId: "g" }), // system no-fav, no adoptado
          node({ id: "s-luz", name: "Luz", parentId: "g" }), // system no-fav, PERO adoptado
        ],
      },
    ];
    const out = filterConfiguredSobreTree(tree, new Set(["s-luz"]));
    expect(out).toHaveLength(1); // el grupo se conserva
    expect(out[0]!.children.map((c) => c.id)).toEqual(["s-rest", "s-luz"]); // Delivery excluido
  });
});

// ---------------------------------------------------------------------------
// listSobresForKind + suggestSobreForChat (chat: sugiere un sobre real del usuario)
// ---------------------------------------------------------------------------
describe("listSobresForKind", () => {
  it("solo sobres de la naturaleza pedida, con su frasco", async () => {
    h.cats = [
      cat({ id: "f-alim", name: "Alimentación", categoryType: "expense" }),
      cat({ id: "s-rest", name: "Restaurantes", parentId: "f-alim", categoryType: "expense" }),
      cat({ id: "c-salario", name: "Salario", categoryType: "income" }),
    ];
    const gasto = await listSobresForKind("gasto");
    expect(gasto).toEqual([{ id: "s-rest", sobre: "Restaurantes", frasco: "Alimentación" }]);
    const ingreso = await listSobresForKind("ingreso");
    expect(ingreso).toEqual([{ id: "c-salario", sobre: "Salario", frasco: null }]);
  });

  it("GASTO: excluye plantillas system sin adoptar (delivery/café), incluye favoritas y propias", async () => {
    h.cats = [
      cat({ id: "f-alim", name: "Alimentación", categoryType: "expense", isSystem: true }),
      // Plantilla system sin adoptar (sin favorito, sin budget/gasto) → NO aparece.
      cat({ id: "s-deli", name: "Delivery", parentId: "f-alim", isSystem: true, isFavorite: false }),
      // Favorita de fábrica → aparece.
      cat({ id: "s-rest", name: "Restaurantes", parentId: "f-alim", isSystem: true, isFavorite: true }),
      // Creada por el usuario (no system) → aparece.
      cat({ id: "s-mio", name: "Mi sobre", parentId: "f-alim", isSystem: false }),
    ];
    const out = await listSobresForKind("gasto");
    // Orden alfabético por sobre ("Mi sobre" < "Restaurantes"); "Delivery" excluido.
    expect(out.map((s) => s.id)).toEqual(["s-mio", "s-rest"]);
  });

  it("GASTO: una plantilla system se ADOPTA si tiene budget o gasto del mes (= vista de frascos)", async () => {
    h.cats = [
      cat({ id: "f-serv", name: "Servicios", categoryType: "expense", isSystem: true }),
      cat({ id: "s-luz", name: "Luz", parentId: "f-serv", isSystem: true, isFavorite: false }),
      cat({ id: "s-agua", name: "Agua", parentId: "f-serv", isSystem: true, isFavorite: false }),
    ];
    // Luz tiene presupuesto; Agua tiene gasto → ambas adoptadas. (value>0, como expense-jars:492)
    h.budgetByKey = { "s-luz": { value: 30000 } };
    h.realByKey = { "s-agua": { value: 12000 } };
    const out = await listSobresForKind("gasto");
    expect(out.map((s) => s.id).sort()).toEqual(["s-agua", "s-luz"]);
  });

  it("GASTO: budget/gasto en 0 NO adopta (mismo umbral value>0 que la vista de frascos)", async () => {
    h.cats = [
      cat({ id: "f-serv", name: "Servicios", categoryType: "expense", isSystem: true }),
      cat({ id: "s-luz", name: "Luz", parentId: "f-serv", isSystem: true, isFavorite: false }),
    ];
    h.budgetByKey = { "s-luz": { value: 0 } };
    expect(await listSobresForKind("gasto")).toEqual([]);
  });

  it("INGRESO: sin filtro de adopción (no hay vista de frascos de ingreso)", async () => {
    h.cats = [
      cat({ id: "c-otros", name: "Otros ingresos", categoryType: "income", isSystem: true, isFavorite: false }),
    ];
    const out = await listSobresForKind("ingreso");
    expect(out.map((s) => s.id)).toEqual(["c-otros"]); // aparece pese a system+no-favorito
  });
});

describe("suggestSobreForChat", () => {
  it("la IA elige un sobre REAL del usuario → categoryId + 'Frasco › Sobre'", async () => {
    h.cats = [
      cat({ id: "f-alim", name: "Alimentación", categoryType: "expense" }),
      cat({ id: "s-rest", name: "Restaurantes", parentId: "f-alim", categoryType: "expense" }),
    ];
    h.aiText = '{"categoryId":"s-rest","confidence":0.9}';
    const r = await suggestSobreForChat("Starbucks", "gasto");
    expect(r).toEqual({ categoryId: "s-rest", categoryPath: "Alimentación › Restaurantes" });
  });

  it("solo pasa a la IA los sobres de la naturaleza (un ingreso no ve sobres de gasto)", async () => {
    h.cats = [
      cat({ id: "s-rest", name: "Restaurantes", categoryType: "expense" }),
      cat({ id: "c-salario", name: "Salario", categoryType: "income" }),
    ];
    await suggestSobreForChat("Nómina ACME", "ingreso");
    const passed = h.provider!.chat.mock.calls[0]![0] as { messages: { content: string }[] };
    expect(passed.messages[0]!.content).toContain("Salario");
    expect(passed.messages[0]!.content).not.toContain("Restaurantes");
  });

  it("la IA no matchea → FALLBACK por historial del hogar (sin IA)", async () => {
    h.cats = [
      cat({ id: "f-alim", name: "Alimentación", categoryType: "expense" }),
      cat({ id: "s-rest", name: "Restaurantes", parentId: "f-alim", categoryType: "expense" }),
    ];
    h.aiText = '{"categoryId":null,"confidence":0}'; // IA no matchea
    h.historyRows = [
      { merchant_or_source: "Soda La Esquina", description: null, category_id: "s-rest", kind: "gasto" },
    ];
    h.catRow = { category_type: "expense", is_active: true }; // valida como hoja
    const r = await suggestSobreForChat("Soda La Esquina", "gasto");
    expect(r).toEqual({ categoryId: "s-rest", categoryPath: "Alimentación › Restaurantes" });
  });

  it("sin match (ni IA ni historial) → 'Sin sobre' (null), no rompe", async () => {
    h.cats = [cat({ id: "s-rest", name: "Restaurantes", categoryType: "expense" })];
    const r = await suggestSobreForChat("Comercio Desconocido", "gasto");
    expect(r).toEqual({ categoryId: null, categoryPath: null });
  });

  it("descripción vacía o usuario sin sobres → null", async () => {
    expect(await suggestSobreForChat("   ", "gasto")).toEqual({ categoryId: null, categoryPath: null });
    h.cats = [cat({ id: "c-salario", name: "Salario", categoryType: "income" })];
    // Un gasto no tiene sobres de gasto disponibles → null.
    expect(await suggestSobreForChat("Algo", "gasto")).toEqual({ categoryId: null, categoryPath: null });
  });
});
