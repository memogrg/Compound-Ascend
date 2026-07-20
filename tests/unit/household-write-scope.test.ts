/**
 * householdWriteScope: la autorización de ESCRITURA de la edición compartida.
 * Un editor (owner/adult) escribe cualquier fila del hogar; un no-editor
 * (viewer/child) solo las suyas. Es el candado que, junto al RLS, decide quién
 * puede tocar qué — replicado acá porque un error de más abre datos ajenos y
 * uno de menos rompe la edición compartida.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T,>(fn: T) => fn };
});

import { householdWriteScope } from "@/lib/household/active";

type Row = { user_id?: string; household_id?: string; role?: string; status?: string };

/**
 * Supabase mínimo: household_members responde según el filtro. `role` fija el
 * rol del usuario consultado (para resolveActiveMembership / isActiveHouseholdEditor).
 */
function mockSupabase(rows: { self: Row[]; members: Row[] }) {
  return {
    from(table: string) {
      if (table !== "household_members") throw new Error(`tabla inesperada: ${table}`);
      const filters: Record<string, string> = {};
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string, val: string) => {
          filters[col] = val;
          return q;
        },
        // resolveActiveMembership: .eq(user_id).eq(status).order()
        order: () => Promise.resolve({ data: rows.self, error: null }),
        // householdMemberIds: .eq(household_id).eq(status) → thenable
        then: (resolve: (r: { data: Row[]; error: null }) => void) =>
          resolve({ data: rows.members.filter((m) => m.household_id === filters.household_id), error: null }),
      };
      return q;
    },
  } as never;
}

describe("householdWriteScope", () => {
  it("editor (adult) → alcance = todos los miembros del hogar", async () => {
    const supabase = mockSupabase({
      self: [{ household_id: "hh1", role: "adult", status: "active" }],
      members: [
        { user_id: "A", household_id: "hh1" },
        { user_id: "B", household_id: "hh1" },
      ],
    });
    const scope = await householdWriteScope(supabase, "B");
    expect(scope.sort()).toEqual(["A", "B"]);
  });

  it("owner → alcance = todos los miembros", async () => {
    const supabase = mockSupabase({
      self: [{ household_id: "hh1", role: "owner", status: "active" }],
      members: [
        { user_id: "A", household_id: "hh1" },
        { user_id: "B", household_id: "hh1" },
      ],
    });
    expect((await householdWriteScope(supabase, "A")).sort()).toEqual(["A", "B"]);
  });

  it("no-editor (viewer) → alcance = SOLO el propio (no puede tocar filas ajenas)", async () => {
    const supabase = mockSupabase({
      self: [{ household_id: "hh1", role: "viewer", status: "active" }],
      members: [
        { user_id: "A", household_id: "hh1" },
        { user_id: "B", household_id: "hh1" },
      ],
    });
    expect(await householdWriteScope(supabase, "B")).toEqual(["B"]);
  });

  it("child → solo-lectura, alcance = el propio", async () => {
    const supabase = mockSupabase({
      self: [{ household_id: "hh1", role: "child", status: "active" }],
      members: [{ user_id: "A", household_id: "hh1" }, { user_id: "C", household_id: "hh1" }],
    });
    expect(await householdWriteScope(supabase, "C")).toEqual(["C"]);
  });

  it("modo solo (sin hogar) → editor de sus propios datos, alcance = el propio", async () => {
    const supabase = mockSupabase({ self: [], members: [] });
    expect(await householdWriteScope(supabase, "A")).toEqual(["A"]);
  });
});
