import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CsvTxnInput } from "@/modules/financial-base/schemas";

/**
 * #2 (PR B) · el import CSV asigna las filas a la CUENTA elegida en el modal (nivel-modal), en vez
 * del `account_id: null` hardcodeado. Fake db (vi.hoisted) que captura el insert en `transactions`
 * para inspeccionar el payload; corre la lógica REAL de importTransactions encima.
 */
const H = vi.hoisted(() => {
  const inserted: Record<string, unknown[]> = {};
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    Object.assign(b, {
      select: self,
      eq: self,
      order: self,
      insert: (row: unknown) => {
        (inserted[table] ??= []).push(row);
        return b;
      },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ error: null, data: [] }).then(resolve),
    });
    return b;
  };
  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
  return { db, inserted };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => H.db }));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => "hh1" }));
vi.mock("@/modules/financial-base/services/base-service", () => ({
  getPrimaryCurrency: async () => "CRC",
  getDisplayCurrency: async () => "CRC",
}));

import { importTransactions } from "@/modules/financial-base/services/transaction-service";

const rows: CsvTxnInput[] = [
  { kind: "gasto", amount: 1000, occurredOn: "2026-08-01", description: "Súper" },
  { kind: "ingreso", amount: 5000, occurredOn: "2026-08-02", description: "Venta" },
];

/** El insert es uno solo con el array de filas → el payload capturado es esa array. */
function capturedRows(): { account_id: string | null }[] {
  return H.inserted["transactions"]![0] as { account_id: string | null }[];
}

describe("importTransactions · asigna la cuenta elegida (#2 CSV)", () => {
  beforeEach(() => {
    H.inserted["transactions"] = [];
  });

  it("con accountId → TODAS las filas caen con ese account_id", async () => {
    const n = await importTransactions(rows, "acc-123");
    expect(n).toBe(2);
    const payload = capturedRows();
    expect(payload).toHaveLength(2);
    expect(payload.every((r) => r.account_id === "acc-123")).toBe(true);
  });

  it("sin accountId (default) → account_id null (comportamiento anterior intacto)", async () => {
    await importTransactions(rows);
    expect(capturedRows().every((r) => r.account_id === null)).toBe(true);
  });
});
