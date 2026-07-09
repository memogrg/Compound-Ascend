import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado compartido por los mocks (provider IA + cliente Supabase + categorías).
const h = vi.hoisted(() => ({
  provider: null as { chat: ReturnType<typeof vi.fn> } | null,
  aiText: '{"categoryId":null,"confidence":0}',
  cacheRows: [] as Record<string, unknown>[],
  historyRows: [] as Record<string, unknown>[],
  upsertSpy: vi.fn(),
  cats: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/providers/gemini", () => ({ createGeminiProvider: () => h.provider }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const data = table === "transactions" ? h.historyRows : h.cacheRows;
      const b: Record<string, unknown> = {
        select: () => b,
        in: () => b,
        not: () => b,
        order: () => b,
        limit: () => b,
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
  AUTO_ASSIGN_MIN_CONFIDENCE,
  MAX_NEW_SUGGESTION_CALLS,
} from "@/modules/financial-base/services/ai-categorize";

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
