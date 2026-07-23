import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * getSobreRemaining reusa getBudgetTotals/getRealTotals (por category_id, moneda de
 * visualización) y NO recalcula a mano. Aquí mockeamos ambos + listCategories para verificar el
 * armado del restante y los casos del mensaje del chat (sin presupuesto, excedido, sin frasco).
 */
const h = vi.hoisted(() => ({
  budgetByKey: {} as Record<string, { label: string; value: number }>,
  realByKey: {} as Record<string, { label: string; value: number }>,
  currency: "CRC",
  cats: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/financial-base/services/budget-service", () => ({
  getBudgetTotals: async () => ({ expenseByKey: h.budgetByKey, currency: h.currency }),
}));
vi.mock("@/modules/financial-base/services/transaction-service", () => ({
  getRealTotals: async () => ({ expenseByKey: h.realByKey, currency: h.currency }),
}));
vi.mock("@/modules/financial-base/services/categories-service", () => ({
  listCategories: async () => h.cats,
}));

import { getSobreRemaining } from "@/modules/financial-base/services/sobre-remaining";

const cat = (over: Record<string, unknown>) => ({
  id: "x", name: "X", parentId: null, isActive: true, categoryType: "expense", ...over,
});

beforeEach(() => {
  h.budgetByKey = {};
  h.realByKey = {};
  h.currency = "CRC";
  h.cats = [
    cat({ id: "f-alim", name: "Alimentación" }),
    cat({ id: "s-rest", name: "Restaurantes", parentId: "f-alim" }),
    cat({ id: "s-suelto", name: "Suelto", parentId: null }),
  ];
});

describe("getSobreRemaining", () => {
  it("sobre con presupuesto → restante = budget − spent y ruta 'Frasco › Sobre'", async () => {
    h.budgetByKey = { "s-rest": { label: "Restaurantes", value: 100_000 } };
    h.realByKey = { "s-rest": { label: "Restaurantes", value: 30_000 } };
    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r).toEqual({
      path: "Alimentación › Restaurantes",
      currency: "CRC",
      budget: 100_000,
      spent: 30_000,
      remaining: 70_000,
      hasBudget: true,
    });
  });

  it("sobre SIN presupuesto del mes → hasBudget:false, sin inventar restante", async () => {
    h.realByKey = { "s-rest": { label: "Restaurantes", value: 30_000 } };
    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r).toMatchObject({ hasBudget: false, budget: 0, remaining: 0, spent: 30_000 });
  });

  it("gasto que excede el presupuesto → restante negativo", async () => {
    h.budgetByKey = { "s-rest": { label: "Restaurantes", value: 50_000 } };
    h.realByKey = { "s-rest": { label: "Restaurantes", value: 72_000 } };
    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r?.remaining).toBe(-22_000);
    expect(r?.hasBudget).toBe(true);
  });

  it("sobre sin frasco (sin padre) → path = solo el sobre", async () => {
    h.budgetByKey = { "s-suelto": { label: "Suelto", value: 10_000 } };
    const r = await getSobreRemaining("s-suelto", "2026-07-15");
    expect(r?.path).toBe("Suelto");
  });

  it("categoryId inexistente → null (el chat degrada a mensaje genérico)", async () => {
    const r = await getSobreRemaining("no-existe", "2026-07-15");
    expect(r).toBeNull();
  });

  it("fecha inválida → null", async () => {
    expect(await getSobreRemaining("s-rest", "")).toBeNull();
  });
});
