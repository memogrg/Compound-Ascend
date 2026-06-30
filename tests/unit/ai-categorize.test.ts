import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado compartido por los mocks (provider IA + cliente Supabase + categorías).
const h = vi.hoisted(() => ({
  provider: null as { chat: ReturnType<typeof vi.fn> } | null,
  aiText: '{"categoryId":null,"confidence":0}',
  cacheRows: [] as Record<string, unknown>[],
  upsertSpy: vi.fn(),
  cats: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/providers/gemini", () => ({ createGeminiProvider: () => h.provider }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        in: () => b,
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data: h.cacheRows, error: null }).then(r, j),
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
}));

import {
  suggestSobre,
  getSuggestionsFor,
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
    expect(res.get("t1")).toEqual({ categoryId: "c-comida", confidence: 0.9 });
    expect(h.provider!.chat).not.toHaveBeenCalled();
    expect(h.upsertSpy).not.toHaveBeenCalled();
  });

  it("miss → llama a la IA una vez y guarda en caché", async () => {
    h.aiText = '{"categoryId":"c-comida","confidence":0.8}';
    const res = await getSuggestionsFor([{ id: "t1", merchant: "Starbucks", kind: "gasto" }]);
    expect(h.provider!.chat).toHaveBeenCalledTimes(1);
    expect(res.get("t1")).toEqual({ categoryId: "c-comida", confidence: 0.8 });
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
