/**
 * Cobertura del motor de reglas compartido (`rules-service.ts`): matcher puro
 * `pickMatchingRule` + lector service-role `findMatchingRuleForUser`.
 *
 * Portado del test de autocategorización del canal retirado:
 * `pickMatchingRule` sigue vivo (lo usa `findMatchingRule`, que consume
 * `transaction-service` en el alta de la app), y su única cobertura estaba en ese
 * archivo. `findMatchingRuleForUser` (variante sin sesión) quedó sin llamador al
 * borrar `write-service`, pero se conserva para el flujo de registro sin sesión de
 * la app (móvil/ingesta), igual que `ingestion/normalize.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado compartido por los mocks (service-role fake). Hoisted para el factory de vi.mock.
const h = vi.hoisted(() => ({
  rules: [] as Record<string, unknown>[],
  categoryName: "Comida" as string | null,
}));

vi.mock("server-only", () => ({}));

// Fake del cliente service-role: builder "thenable" para las lecturas
// (transaction_rules / expense_categories) que usa findMatchingRuleForUser.
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => {
    const builder = (result: unknown) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        is: () => b,
        order: () => b,
        maybeSingle: () => Promise.resolve(result),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(res, rej),
      };
      return b;
    };
    return {
      from: (table: string) => {
        if (table === "transaction_rules") return builder({ data: h.rules, error: null });
        if (table === "expense_categories")
          return builder({ data: h.categoryName ? { name: h.categoryName } : null, error: null });
        return builder({ data: null, error: null });
      },
    };
  },
}));

import {
  pickMatchingRule,
  findMatchingRuleForUser,
  type TransactionRule,
} from "@/modules/financial-base/services/rules-service";

// Fila cruda (snake_case) tal cual la devuelve Supabase para transaction_rules.
const ruleRow = (over: Record<string, unknown>) => ({
  id: "r1",
  user_id: "u1",
  household_id: null,
  merchant_pattern: "x",
  suggested_category_id: null,
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
  h.rules = [];
  h.categoryName = "Comida";
});

// ---------------------------------------------------------------------------
// pickMatchingRule (puro)
// ---------------------------------------------------------------------------
describe("pickMatchingRule", () => {
  const rules: TransactionRule[] = [
    {
      id: "r1",
      merchantPattern: "starbucks",
      suggestedCategoryId: "cat-comida",
      suggestedAccountId: null,
      type: "expense",
      active: true,
      priority: 0,
      linkedKind: null,
      linkedId: null,
    },
    {
      id: "r2",
      merchantPattern: "salario",
      suggestedCategoryId: "cat-sueldo",
      suggestedAccountId: null,
      type: "income",
      active: true,
      priority: 0,
      linkedKind: null,
      linkedId: null,
    },
    {
      id: "r3",
      merchantPattern: "netflix",
      suggestedCategoryId: "cat-strm",
      suggestedAccountId: null,
      type: "expense",
      active: false, // inactiva
      priority: 0,
      linkedKind: null,
      linkedId: null,
    },
  ];

  it("matchea por substring case-insensitive", () => {
    expect(pickMatchingRule(rules, "Compra STARBUCKS Centro", "expense")?.id).toBe("r1");
  });
  it("respeta el tipo (gasto vs ingreso)", () => {
    expect(pickMatchingRule(rules, "Starbucks", "income")).toBeNull();
    expect(pickMatchingRule(rules, "Pago de SALARIO", "income")?.id).toBe("r2");
  });
  it("ignora reglas inactivas", () => {
    expect(pickMatchingRule(rules, "Cobro NETFLIX", "expense")).toBeNull();
  });
  it("sin match o sin comercio → null", () => {
    expect(pickMatchingRule(rules, "Comercio random", "expense")).toBeNull();
    expect(pickMatchingRule(rules, null, "expense")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findMatchingRuleForUser (service-role)
// ---------------------------------------------------------------------------
describe("findMatchingRuleForUser", () => {
  it("lee las reglas del usuario y devuelve la categoría que matchea", async () => {
    h.rules = [
      ruleRow({
        merchant_pattern: "starbucks",
        suggested_category_id: "cat-comida",
        type: "expense",
      }),
    ];
    const r = await findMatchingRuleForUser("u1", "Compra Starbucks Centro", "expense");
    expect(r?.suggestedCategoryId).toBe("cat-comida");
  });
  it("sin regla que matchee → null", async () => {
    h.rules = [ruleRow({ merchant_pattern: "uber", type: "expense" })];
    expect(await findMatchingRuleForUser("u1", "Starbucks", "expense")).toBeNull();
  });
});
