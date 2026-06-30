import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  selectUncategorized,
  selectableCategoryLeaves,
  categoryMatchesKind,
} from "@/modules/financial-base/engine/classify";
import type { Transaction } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";

// ---------------------------------------------------------------------------
// CAMBIO 5.1 — selectUncategorized (puro)
// ---------------------------------------------------------------------------
const txn = (over: Partial<Transaction>): Transaction =>
  ({
    id: "t",
    kind: "gasto",
    description: null,
    merchantOrSource: null,
    amount: 1000,
    currency: "CRC",
    occurredOn: "2026-06-30",
    categoryId: null,
    accountId: null,
    accountLabel: null,
    status: "confirmed",
    origin: "manual",
    receiptUrl: null,
    confirmedByUser: true,
    ...over,
  }) as Transaction;

describe("classify · selectUncategorized", () => {
  it("toma gasto/ingreso con categoryId null; ignora categorizadas y 'ajuste'", () => {
    const list = [
      txn({ id: "a", kind: "gasto", categoryId: null }),
      txn({ id: "b", kind: "ingreso", categoryId: null }),
      txn({ id: "c", kind: "gasto", categoryId: "cat1" }), // ya categorizada
      txn({ id: "d", kind: "ajuste", categoryId: null }), // ajuste: no va a un sobre
    ];
    const out = selectUncategorized(list).map((t) => t.id);
    expect(out).toEqual(["a", "b"]);
  });
});

describe("classify · selectableCategoryLeaves / categoryMatchesKind", () => {
  const cat = (over: Partial<Category>): Category =>
    ({
      id: "x",
      key: null,
      name: "X",
      defaultNature: null,
      parentId: null,
      icon: null,
      color: null,
      isFavorite: false,
      isActive: true,
      isSystem: false,
      categoryType: "expense",
      sortOrder: 0,
      linkedKind: null,
      ...over,
    }) as Category;

  it("devuelve solo hojas activas y excluye 'transfer'", () => {
    const cats = [
      cat({ id: "g", name: "Hogar", parentId: null }), // padre → no hoja
      cat({ id: "g1", name: "Súper", parentId: "g" }), // hoja
      cat({ id: "i", name: "Salario", parentId: null, categoryType: "income" }), // hoja
      cat({ id: "t", name: "Transfer", parentId: null, categoryType: "transfer" }), // excluida
      cat({ id: "off", name: "Vieja", parentId: null, isActive: false }), // inactiva
    ];
    const leaves = selectableCategoryLeaves(cats).map((c) => c.id);
    expect(leaves).toContain("g1");
    expect(leaves).toContain("i");
    expect(leaves).not.toContain("g"); // es padre
    expect(leaves).not.toContain("t"); // transfer
    expect(leaves).not.toContain("off"); // inactiva
  });

  it("categoryMatchesKind: gasto→expense/both, ingreso→income/both", () => {
    expect(categoryMatchesKind("expense", "gasto")).toBe(true);
    expect(categoryMatchesKind("income", "gasto")).toBe(false);
    expect(categoryMatchesKind("income", "ingreso")).toBe(true);
    expect(categoryMatchesKind("both", "gasto")).toBe(true);
    expect(categoryMatchesKind("both", "ingreso")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CAMBIO 5.2 — assignCategoryAction (mockea los servicios que escribe)
// ---------------------------------------------------------------------------
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: "u1" }),
  isSupabaseConfigured: () => true,
}));

const setTransactionCategory = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/modules/financial-base/services/transaction-service", async (orig) => ({
  ...(await orig<typeof import("@/modules/financial-base/services/transaction-service")>()),
  setTransactionCategory: (...a: unknown[]) => setTransactionCategory(...a),
}));

const upsertRuleForMerchant = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/modules/financial-base/services/rules-service", async (orig) => ({
  ...(await orig<typeof import("@/modules/financial-base/services/rules-service")>()),
  upsertRuleForMerchant: (...a: unknown[]) => upsertRuleForMerchant(...a),
}));

import { assignCategoryAction } from "@/modules/financial-base/api/v2-actions";

const TXN = "11111111-1111-4111-8111-111111111111";
const CAT = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assignCategoryAction", () => {
  it("asigna la categoría a la transacción; sin crearRegla NO crea regla", async () => {
    const res = await assignCategoryAction({ transactionId: TXN, categoryId: CAT });
    expect(res.ok).toBe(true);
    expect(setTransactionCategory).toHaveBeenCalledWith(TXN, CAT);
    expect(upsertRuleForMerchant).not.toHaveBeenCalled();
  });

  it("con crearRegla + merchant → upsert de la regla del comercio (no duplica)", async () => {
    const res = await assignCategoryAction({
      transactionId: TXN,
      categoryId: CAT,
      crearRegla: true,
      merchant: "Starbucks",
      type: "expense",
    });
    expect(res.ok).toBe(true);
    expect(setTransactionCategory).toHaveBeenCalledWith(TXN, CAT);
    expect(upsertRuleForMerchant).toHaveBeenCalledTimes(1);
    expect(upsertRuleForMerchant).toHaveBeenCalledWith("Starbucks", "expense", CAT);
  });

  it("entrada inválida (sin categoryId) → error, no escribe", async () => {
    const res = await assignCategoryAction({ transactionId: TXN });
    expect(res.ok).toBe(false);
    expect(setTransactionCategory).not.toHaveBeenCalled();
  });
});
