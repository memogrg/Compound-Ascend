/**
 * logHouseholdDeletion: best-effort y correcto.
 *  - registra tabla+id+quién con el hogar activo;
 *  - modo solo (sin hogar) → no registra nada;
 *  - si el insert falla, NO lanza (un log a medias no debe tumbar el borrado).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  activeHousehold: "hh1" as string | null,
  insertError: null as { message: string } | null,
  inserted: [] as unknown[],
}));

vi.mock("@/lib/household/active", () => ({
  getActiveHouseholdId: async () => h.activeHousehold,
}));

function mockSupabase() {
  return {
    from(table: string) {
      expect(table).toBe("household_activity_log");
      return {
        insert: async (row: unknown) => {
          h.inserted.push(row);
          return { error: h.insertError };
        },
      };
    },
  } as never;
}

import { logHouseholdDeletion } from "@/lib/household/activity-log";

beforeEach(() => {
  h.activeHousehold = "hh1";
  h.insertError = null;
  h.inserted = [];
});

describe("logHouseholdDeletion", () => {
  it("registra tabla + row_id + quién con el hogar activo", async () => {
    await logHouseholdDeletion(mockSupabase(), { userId: "B", table: "savings_goals", rowId: "g1" });
    expect(h.inserted).toEqual([
      { household_id: "hh1", user_id: "B", table_name: "savings_goals", row_id: "g1", action: "delete" },
    ]);
  });

  it("modo solo (sin hogar) → no registra nada", async () => {
    h.activeHousehold = null;
    await logHouseholdDeletion(mockSupabase(), { userId: "B", table: "debts", rowId: "d1" });
    expect(h.inserted).toEqual([]);
  });

  it("householdId explícito evita recomputar el hogar activo", async () => {
    await logHouseholdDeletion(mockSupabase(), {
      userId: "B", table: "debts", rowId: "d1", householdId: "hhX",
    });
    expect((h.inserted[0] as { household_id: string }).household_id).toBe("hhX");
  });

  it("si el insert falla, NO lanza (best-effort)", async () => {
    h.insertError = { message: "boom" };
    await expect(
      logHouseholdDeletion(mockSupabase(), { userId: "B", table: "debts", rowId: "d1" }),
    ).resolves.toBeUndefined();
  });
});
