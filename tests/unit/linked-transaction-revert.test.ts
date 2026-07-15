import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * reverseLinkedTransaction(): al borrar una transacción vinculada, revierte su
 * ledger de origen (integridad · orquestador).
 *  - debt → borra el debt_payment ligado vía la RPC atómica delete_debt_payment.
 *  - goal → aplica el delta inverso a savings_goals.current_amount (aporte resta,
 *    retiro suma), sin bajar de 0.
 */

// Estado del fake del cliente Supabase.
const h = vi.hoisted(() => ({
  debtPayment: null as { id: string } | null,
  goalRow: null as { current_amount: number; target_amount?: number } | null,
  rpcSpy: vi.fn(),
  goalUpdateSpy: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => "hh1" }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => {
          if (table === "debt_payments") return { data: h.debtPayment, error: null };
          if (table === "savings_goals") return { data: h.goalRow, error: null };
          return { data: null, error: null };
        },
        update: (payload: Record<string, unknown>) => {
          if (table === "savings_goals") h.goalUpdateSpy(payload);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        },
      };
      return b;
    },
    rpc: async (name: string, params: Record<string, unknown>) => {
      h.rpcSpy(name, params);
      return { error: null };
    },
  }),
}));

import { reverseLinkedTransaction } from "@/modules/financial-base/services/linked-transaction-service";

beforeEach(() => {
  h.debtPayment = null;
  h.goalRow = null;
  h.rpcSpy.mockClear();
  h.goalUpdateSpy.mockClear();
});

describe("reverseLinkedTransaction · debt", () => {
  it("borra el debt_payment ligado vía la RPC delete_debt_payment", async () => {
    h.debtPayment = { id: "pay1" };
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "debt",
      linkedId: "debt1",
      amount: 25000,
      occurredOn: "2026-07-08",
    });
    expect(h.rpcSpy).toHaveBeenCalledTimes(1);
    expect(h.rpcSpy).toHaveBeenCalledWith("delete_debt_payment", { p_payment_id: "pay1" });
  });

  it("no falla si no hay debt_payment (anómalo): no llama la RPC", async () => {
    h.debtPayment = null;
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "debt",
      linkedId: "debt1",
      amount: 25000,
      occurredOn: "2026-07-08",
    });
    expect(h.rpcSpy).not.toHaveBeenCalled();
  });
});

describe("reverseLinkedTransaction · goal", () => {
  it("aporte (gasto) revertido → RESTA el monto de current_amount", async () => {
    h.goalRow = { current_amount: 100000 };
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "goal",
      linkedId: "goal1",
      amount: 30000,
      occurredOn: "2026-07-08",
    });
    expect(h.goalUpdateSpy).toHaveBeenCalledTimes(1);
    expect(h.goalUpdateSpy.mock.calls[0]![0]).toEqual({ current_amount: 70000 });
  });

  it("retiro (ingreso) revertido → SUMA el monto de vuelta a current_amount", async () => {
    h.goalRow = { current_amount: 100000 };
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "ingreso",
      linkedKind: "goal",
      linkedId: "goal1",
      amount: 30000,
      occurredOn: "2026-07-08",
    });
    expect(h.goalUpdateSpy.mock.calls[0]![0]).toEqual({ current_amount: 130000 });
  });

  it("consumo del frasco (gasto off-budget) revertido → RESTAURA current_amount Y target_amount", async () => {
    h.goalRow = { current_amount: 180000, target_amount: 980000 };
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "goal",
      linkedId: "goal1",
      amount: 20000,
      occurredOn: "2026-07-10",
      countsInBudget: false, // consumo off-budget: inverso de spendFromGoal
    });
    // 180k → 200k acumulado; 980k → 1M meta (deshace el encogimiento).
    expect(h.goalUpdateSpy.mock.calls[0]![0]).toEqual({
      current_amount: 200000,
      target_amount: 1000000,
    });
  });

  it("aporte budget-aware (countsInBudget=true) NO restaura target, solo resta current", async () => {
    h.goalRow = { current_amount: 100000, target_amount: 500000 };
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "goal",
      linkedId: "goal1",
      amount: 30000,
      occurredOn: "2026-07-08",
      countsInBudget: true,
    });
    expect(h.goalUpdateSpy.mock.calls[0]![0]).toEqual({ current_amount: 70000 });
  });

  it("no baja de 0 al revertir un aporte mayor que el saldo", async () => {
    h.goalRow = { current_amount: 20000 };
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "goal",
      linkedId: "goal1",
      amount: 50000,
      occurredOn: "2026-07-08",
    });
    expect(h.goalUpdateSpy.mock.calls[0]![0]).toEqual({ current_amount: 0 });
  });

  it("no toca nada si la meta ya no existe", async () => {
    h.goalRow = null;
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "goal",
      linkedId: "goal1",
      amount: 30000,
      occurredOn: "2026-07-08",
    });
    expect(h.goalUpdateSpy).not.toHaveBeenCalled();
  });
});

describe("reverseLinkedTransaction · sin vínculo / no definido", () => {
  it("linkedId null → no-op", async () => {
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "debt",
      linkedId: null,
      amount: 1,
      occurredOn: "2026-07-08",
    });
    expect(h.rpcSpy).not.toHaveBeenCalled();
    expect(h.goalUpdateSpy).not.toHaveBeenCalled();
  });

  it("holding (reversión no definida) → no-op seguro", async () => {
    await reverseLinkedTransaction({
      transactionId: "txn1",
      kind: "gasto",
      linkedKind: "holding",
      linkedId: "h1",
      amount: 1000,
      occurredOn: "2026-07-08",
    });
    expect(h.rpcSpy).not.toHaveBeenCalled();
    expect(h.goalUpdateSpy).not.toHaveBeenCalled();
  });
});
