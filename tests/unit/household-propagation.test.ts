/**
 * Guardia de integración household × orquestador (merge interconexión + main).
 *
 * Contrato: cuando el usuario tiene hogar activo, TODA escritura del
 * orquestador al ledger especializado debe llevar household_id — si no, el
 * resto del hogar no vería el registro (las RLS filtran por hogar). Este test
 * falla si alguien quita household_id del insert de debt_payments en
 * propagateLinkedTransaction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const HOUSEHOLD = "hh-0000-1111";
let activeHousehold: string | null = HOUSEHOLD;

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/household/active", () => ({
  getActiveHouseholdId: vi.fn(async () => activeHousehold),
}));

// Cliente supabase mínimo: from("debts") responde la deuda; from("debt_payments")
// captura el payload del insert para inspeccionarlo.
const inserted: Record<string, unknown[]> = {};
function mockSupabase() {
  return {
    from(table: string) {
      if (table === "debts") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            data: { balance: 1000, apr: 12, current_payment: 100, min_payment: 100 },
            error: null,
          }),
        };
        return q;
      }
      return {
        insert: async (payload: unknown) => {
          (inserted[table] ??= []).push(payload);
          return { error: null };
        },
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      };
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase()),
}));

import { propagateLinkedTransaction } from "@/modules/financial-base/services/linked-transaction-service";

beforeEach(() => {
  for (const k of Object.keys(inserted)) delete inserted[k];
  activeHousehold = HOUSEHOLD;
});

describe("orquestador × household", () => {
  it("debt_payments del orquestador lleva household_id cuando hay hogar activo", async () => {
    await propagateLinkedTransaction({
      transactionId: "txn-1",
      kind: "gasto",
      linkedKind: "debt",
      linkedId: "debt-1",
      amount: 150,
      occurredOn: "2026-06-11",
    });
    const rows = inserted["debt_payments"] ?? [];
    expect(rows).toHaveLength(1);
    const row = rows[0] as Record<string, unknown>;
    // La aserción clave: si la escritura sale sin household_id, esto truena.
    expect(row).toHaveProperty("household_id", HOUSEHOLD);
    expect(row.transaction_id).toBe("txn-1");
    expect(row.user_id).toBe("user-1");
  });

  it("modo solo (sin hogar): household_id viaja como null, no se omite", async () => {
    activeHousehold = null;
    await propagateLinkedTransaction({
      transactionId: "txn-2",
      kind: "gasto",
      linkedKind: "debt",
      linkedId: "debt-1",
      amount: 100,
      occurredOn: "2026-06-11",
    });
    const row = (inserted["debt_payments"] ?? [])[0] as Record<string, unknown>;
    expect(row).toHaveProperty("household_id", null);
  });
});
