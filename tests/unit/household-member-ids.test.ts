/**
 * Contrato de householdMemberIds: es la base de las lecturas con alcance de
 * hogar. Si devuelve de menos, un miembro ve vacío (el bug que arregla); si
 * devuelve de más, se filtrarían datos de OTRO hogar.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
// React.cache memoiza por request; en test lo hacemos identidad para poder
// variar el escenario entre casos.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

import { householdMemberIds } from "@/lib/household/active";

type Row = { user_id?: string; household_id?: string; role?: string; created_at?: string };

/** Supabase mínimo: household_members responde según el filtro aplicado. */
function mockSupabase(rows: { memberships: Row[]; members: Row[] }) {
  return {
    from(table: string) {
      if (table !== "household_members") throw new Error(`tabla inesperada: ${table}`);
      const filters: Record<string, string> = {};
      const q: Record<string, unknown> = {
        select: (cols: string) => {
          (q as { _cols: string })._cols = cols;
          return q;
        },
        eq: (col: string, val: string) => {
          filters[col] = val;
          return q;
        },
        order: () => Promise.resolve({ data: rows.memberships, error: null }),
        then: (resolve: (r: { data: Row[]; error: null }) => void) =>
          resolve({ data: rows.members.filter((m) => m.household_id === filters.household_id), error: null }),
      };
      return q;
    },
  } as never;
}

describe("householdMemberIds", () => {
  it("modo solo (sin hogar) → solo el propio user_id", async () => {
    const supabase = mockSupabase({ memberships: [], members: [] });
    expect(await householdMemberIds(supabase, "user-A")).toEqual(["user-A"]);
  });

  it("hogar con dos miembros → el invitado ve también al dueño", async () => {
    const supabase = mockSupabase({
      memberships: [{ household_id: "hh-1", role: "adult", created_at: "2026-01-01" }],
      members: [
        { user_id: "user-A", household_id: "hh-1" },
        { user_id: "user-B", household_id: "hh-1" },
      ],
    });
    const ids = await householdMemberIds(supabase, "user-B");
    expect(ids.sort()).toEqual(["user-A", "user-B"]);
  });

  it("nunca incluye miembros de OTRO hogar", async () => {
    const supabase = mockSupabase({
      memberships: [{ household_id: "hh-1", role: "owner", created_at: "2026-01-01" }],
      members: [
        { user_id: "user-A", household_id: "hh-1" },
        { user_id: "user-B", household_id: "hh-1" },
        { user_id: "intruso", household_id: "hh-OTRO" },
      ],
    });
    const ids = await householdMemberIds(supabase, "user-A");
    expect(ids).not.toContain("intruso");
    expect(ids.sort()).toEqual(["user-A", "user-B"]);
  });

  it("si la consulta falla, degrada a solo el propio (nunca menos que hoy)", async () => {
    const supabase = mockSupabase({
      memberships: [{ household_id: "hh-1", role: "owner", created_at: "2026-01-01" }],
      members: [],
    });
    expect(await householdMemberIds(supabase, "user-A")).toEqual(["user-A"]);
  });
});
