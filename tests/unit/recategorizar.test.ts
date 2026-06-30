import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado compartido por el fake del cliente Supabase (sesión/RLS).
const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  updateSpy: vi.fn(),
  updateId: undefined as string | undefined,
  insertSpy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const thenable = (result: unknown) => ({
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(r, j),
      });
      const b: Record<string, unknown> = {
        // listRules: .select().eq().order().order() → await
        select: () => b,
        eq: () => b,
        order: () => b,
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data: h.rows, error: null }).then(r, j),
        // updateRule: .update(payload).eq("id", id).eq("user_id", uid)
        update: (payload: Record<string, unknown>) => {
          h.updateSpy(payload);
          return {
            eq: (_col: string, val: string) => {
              h.updateId = val; // primer eq = "id"
              return { eq: () => thenable({ error: null }) };
            },
          };
        },
        // createRule: .insert(payload)
        insert: (payload: Record<string, unknown>) => {
          h.insertSpy(payload);
          return Promise.resolve({ error: null });
        },
      };
      return b;
    },
  }),
}));

import { upsertRuleForMerchant } from "@/modules/financial-base/services/rules-service";

const ruleRow = (over: Record<string, unknown>) => ({
  id: "r1",
  user_id: "u1",
  household_id: null,
  merchant_pattern: "x",
  suggested_category_id: "cat-old",
  suggested_account_id: null,
  type: "expense",
  active: true,
  priority: 0,
  linked_kind: null,
  linked_id: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  h.rows = [];
  h.updateId = undefined;
  h.updateSpy.mockClear();
  h.insertSpy.mockClear();
});

describe("upsertRuleForMerchant", () => {
  it("si existe una regla activa del mismo type con patrón EXACTO (case-insensitive) → update mismo id, no crea", async () => {
    h.rows = [
      ruleRow({ id: "r1", merchant_pattern: "Starbucks", type: "expense", suggested_category_id: "cat-old" }),
    ];
    await upsertRuleForMerchant("starbucks", "expense", "cat-new");
    expect(h.updateSpy).toHaveBeenCalledTimes(1);
    expect(h.insertSpy).not.toHaveBeenCalled();
    expect(h.updateId).toBe("r1");
    const payload = h.updateSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.suggested_category_id).toBe("cat-new");
    expect(payload.merchant_pattern).toBe("Starbucks"); // preserva el patrón original
  });

  it("si no existe → crea la regla", async () => {
    h.rows = [];
    await upsertRuleForMerchant("Uber", "expense", "cat-x");
    expect(h.insertSpy).toHaveBeenCalledTimes(1);
    expect(h.updateSpy).not.toHaveBeenCalled();
    const payload = h.insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.merchant_pattern).toBe("Uber");
    expect(payload.suggested_category_id).toBe("cat-x");
    expect(payload.type).toBe("expense");
  });

  it("NO pisa una regla de patrón distinto (más genérica/específica) → crea una nueva", async () => {
    // Igualdad exacta, no substring: "Starbucks Centro" ≠ "Starbucks".
    h.rows = [ruleRow({ id: "r9", merchant_pattern: "Starbucks Centro", type: "expense" })];
    await upsertRuleForMerchant("Starbucks", "expense", "cat-new");
    expect(h.insertSpy).toHaveBeenCalledTimes(1);
    expect(h.updateSpy).not.toHaveBeenCalled();
  });

  it("ignora reglas de otro type o inactivas → crea", async () => {
    h.rows = [
      ruleRow({ merchant_pattern: "Starbucks", type: "income" }),
      ruleRow({ merchant_pattern: "Starbucks", type: "expense", active: false }),
    ];
    await upsertRuleForMerchant("Starbucks", "expense", "cat-new");
    expect(h.insertSpy).toHaveBeenCalledTimes(1);
    expect(h.updateSpy).not.toHaveBeenCalled();
  });
});
