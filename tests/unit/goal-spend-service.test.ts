import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Delta A/B · spendFromGoal: gastar del frasco baja el acumulado Y la meta por
 * el mismo monto (la brecha meta−acumulado se conserva), y crea la transacción
 * vinculada OFF-BUDGET. Mockeamos el orquestador (registerLinkedTransaction) y
 * el cliente de Supabase para capturar el update de la meta.
 */
const h = vi.hoisted(() => ({
  register: vi.fn(async (_input: unknown) => "txn-1"),
  del: vi.fn(async (_id: string) => {}),
  goalRow: {
    id: "g1",
    name: "Ropa",
    currency: "CRC",
    current_amount: 200000,
    target_amount: 1000000,
    status: "revisar",
  } as Record<string, unknown>,
  updatePayload: null as Record<string, unknown> | null,
  updateError: null as { message: string } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: "u1" }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => null }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));
vi.mock("@/modules/financial-base", async () => {
  const linked = await vi.importActual<typeof import("@/modules/financial-base/engine/linked")>(
    "@/modules/financial-base/engine/linked",
  );
  return {
    goalSpendToTxn: linked.goalSpendToTxn,
    goalContributionToTxn: linked.goalContributionToTxn,
    goalWithdrawalToTxn: linked.goalWithdrawalToTxn,
    debtPaymentToTxn: linked.debtPaymentToTxn,
    registerLinkedTransaction: h.register,
    deleteLinkedTransaction: h.del,
    buildLinkedTransactionRow: async () => ({}),
    getSystemCategoryId: async () => null,
    getBaseSummary: async () => ({ indicators: { freeCashflow: 0 } }),
    getDisplayCurrency: async () => "CRC",
    listCategoryTree: async () => [],
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        update: (payload: Record<string, unknown>) => {
          h.updatePayload = payload;
          return b;
        },
        maybeSingle: () => Promise.resolve({ data: h.goalRow, error: null }),
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ error: h.updateError }).then(r, j),
      };
      return b;
    },
  }),
}));

import { spendFromGoal } from "@/modules/control/services/control-service";

beforeEach(() => {
  h.register.mockClear();
  h.del.mockClear();
  h.updatePayload = null;
  h.updateError = null;
  h.goalRow.current_amount = 200000;
  h.goalRow.target_amount = 1000000;
});

describe("spendFromGoal · gastar del frasco", () => {
  it("baja acumulado Y meta por el mismo monto (la brecha se conserva)", async () => {
    await spendFromGoal({
      goalId: "g1",
      amount: 20000,
      spendDate: "2026-07-10",
      categoryId: "c-ropa",
    });
    // 200k → 180k acumulado; 1M → 980k meta. Brecha 800k intacta.
    expect(h.updatePayload).toEqual({ current_amount: 180000, target_amount: 980000 });
    // La transacción vinculada nace OFF-BUDGET y con la categoría elegida.
    const txn = h.register.mock.calls[0]![0] as Record<string, unknown>;
    expect(txn.countsInBudget).toBe(false);
    expect(txn.linkedKind).toBe("goal");
    expect(txn.categoryId).toBe("c-ropa");
    expect(txn.kind).toBe("gasto");
  });

  it("rechaza gastar más que el acumulado (sin crear transacción)", async () => {
    await expect(
      spendFromGoal({ goalId: "g1", amount: 300000, spendDate: "2026-07-10", categoryId: null }),
    ).rejects.toThrow(/No puedes gastar más/);
    expect(h.register).not.toHaveBeenCalled();
  });

  it("meta nunca baja de 0 aunque el gasto sea todo el acumulado", async () => {
    h.goalRow.current_amount = 50000;
    h.goalRow.target_amount = 30000; // meta ya menor que el acumulado (caso borde)
    await spendFromGoal({ goalId: "g1", amount: 50000, spendDate: "2026-07-10", categoryId: null });
    expect(h.updatePayload).toEqual({ current_amount: 0, target_amount: 0 });
  });

  it("rollback: si el update de la meta falla, borra la transacción creada", async () => {
    h.updateError = { message: "boom" };
    await expect(
      spendFromGoal({ goalId: "g1", amount: 20000, spendDate: "2026-07-10", categoryId: "c-ropa" }),
    ).rejects.toThrow("boom");
    expect(h.del).toHaveBeenCalledWith("txn-1");
  });
});
