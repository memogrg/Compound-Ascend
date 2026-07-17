import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GoalInput } from "@/modules/control/schemas";

/**
 * Delta "sobre": createGoal con kind='sobre' guarda target_amount = null (sin
 * meta) y sin recurrencia/categoría; con kind='meta' guarda el objetivo normal.
 */
const h = vi.hoisted(() => ({ insert: null as Record<string, unknown> | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => "hh1" }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));
// El barrel de financial-base arrastra componentes server-only; lo stubeamos.
vi.mock("@/modules/financial-base", () => ({
  getBaseSummary: async () => ({ indicators: { freeCashflow: 0 } }),
  getDisplayCurrency: async () => "CRC",
  registerLinkedTransaction: async () => "txn",
  buildLinkedTransactionRow: async () => ({}),
  deleteLinkedTransaction: async () => {},
  getSystemCategoryId: async () => null,
  debtPaymentToTxn: () => ({}),
  goalContributionToTxn: () => ({}),
  goalWithdrawalToTxn: () => ({}),
  goalSpendToTxn: () => ({}),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        h.insert = payload;
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "g-new" }, error: null }),
          }),
        };
      },
    }),
  }),
}));

import { createGoal } from "@/modules/control/services/control-service";

const base = (over: Partial<GoalInput>): GoalInput =>
  ({
    name: "Prueba",
    currentAmount: 0,
    monthlyContribution: 0,
    currency: "CRC",
    kind: "meta",
    recurrence: "ninguna",
    ...over,
  }) as GoalInput;

beforeEach(() => {
  h.insert = null;
});

describe("createGoal · tipo de ahorro", () => {
  it("sobre → target_amount null, recurrence 'ninguna', y PERSISTE la categoría", async () => {
    await createGoal(base({ name: "Maquillaje", kind: "sobre", defaultCategoryId: "c-x" }));
    expect(h.insert).toMatchObject({
      kind: "sobre",
      target_amount: null,
      recurrence: "ninguna",
      period_amount: null,
      next_reset_on: null,
      default_category_id: "c-x", // el sobre lleva categoría
    });
  });

  it("meta con defaultCategoryId → PERSISTE la categoría (agrupa el ahorro)", async () => {
    await createGoal(base({ name: "Seguro auto", kind: "meta", targetAmount: 500_000, defaultCategoryId: "c-transporte" }));
    expect(h.insert).toMatchObject({
      kind: "meta",
      target_amount: 500_000,
      default_category_id: "c-transporte",
    });
  });

  it("defensa (goal_type='defensa:*') → guarda categoría null", async () => {
    await createGoal(
      base({ name: "Fondo de paz", kind: "meta", goalType: "defensa:fondo_paz", defaultCategoryId: "c-x" }),
    );
    expect(h.insert).toMatchObject({ kind: "meta", default_category_id: null });
  });
});
