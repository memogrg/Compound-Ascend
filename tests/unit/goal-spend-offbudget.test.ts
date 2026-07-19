import { describe, it, expect, vi } from "vitest";

/**
 * Delta A · off-budget: un consumo de frasco (transactions.counts_in_budget=false)
 * NO debe sumar al gasto del mes ni al free cashflow real, aunque sea un gasto
 * real y aparezca en los listados. Mockeamos el cliente de Supabase para que
 * listTransactions devuelva un set fijo y verificamos getRealTotals.
 */
const rows = [
  // Gasto normal (cuenta en presupuesto).
  {
    id: "t1",
    kind: "gasto",
    amount: 10000,
    currency: "CRC",
    occurred_on: "2026-07-05",
    category_id: "c1",
    status: "confirmed",
    counts_in_budget: true,
    linked_kind: "none",
  },
  // Consumo de frasco (OFF-BUDGET): no debe contar.
  {
    id: "t2",
    kind: "gasto",
    amount: 20000,
    currency: "CRC",
    occurred_on: "2026-07-06",
    category_id: "c1",
    status: "confirmed",
    counts_in_budget: false,
    linked_kind: "goal",
    linked_id: "g1",
  },
  // Ingreso (referencia para el free cashflow).
  {
    id: "t3",
    kind: "ingreso",
    amount: 50000,
    currency: "CRC",
    occurred_on: "2026-07-01",
    category_id: null,
    status: "confirmed",
    counts_in_budget: true,
    linked_kind: "none",
  },
];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/household/active", () => ({
  // Modo solo: householdMemberIds degrada a [userId], asi estos tests
  // conservan exactamente la semantica que tenian antes del alcance de hogar.
  householdMemberIds: async (_c: unknown, uid: string) => [uid],
  getActiveHouseholdId: async () => null,
  isActiveHouseholdEditor: async () => true,
}));
vi.mock("@/modules/financial-base/services/base-service", () => ({
  getDisplayCurrency: async () => "CRC",
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));
vi.mock("@/modules/financial-base/services/categories-service", () => ({
  getCategoryNameMap: async () => ({ c1: "Comida" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        in: () => b,
        gte: () => b,
        lte: () => b,
        order: () => b,
        range: () => b,
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(r, j),
      };
      return b;
    },
  }),
}));

import { getRealTotals } from "@/modules/financial-base/services/transaction-service";
import { monthPeriod } from "@/modules/financial-base/engine/period";

describe("Delta A · getRealTotals excluye consumos off-budget", () => {
  it("el consumo de frasco no suma al gasto del mes, actuals ni free cashflow", async () => {
    const totals = await getRealTotals(monthPeriod(2026, 7));
    // Solo el gasto normal (10 000), NO el consumo off-budget (20 000).
    expect(totals.realExpense).toBe(10000);
    // Actuals por categoría: 'c1' solo lleva el gasto budget-aware.
    expect(totals.expenseByKey["c1"]?.value).toBe(10000);
    // Free cashflow real = ingreso − gasto budget-aware = 50 000 − 10 000.
    expect(totals.freeCashflowReal).toBe(40000);
    // El ingreso no se ve afectado.
    expect(totals.realIncome).toBe(50000);
  });
});
