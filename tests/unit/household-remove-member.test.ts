/**
 * Guardas de removeHouseholdMember (seguridad): un error de más deja a un adult
 * quitar gente o a alguien removerse solo; uno de menos rompe la gestión. RLS es
 * el candado final, pero estas guardas dan mensajes claros y evitan no-ops.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "ME" }) }));

// Filas de household_members por (columna→valor de filtro). Configurable por caso.
const h = vi.hoisted(() => ({
  meRows: [] as { household_id: string; role: string }[],
  targetRow: null as { role: string; status: string } | null,
  updated: null as { household_id: string; user_id: string; status: string } | null,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      if (table !== "household_members") throw new Error(table);
      const f: Record<string, string> = {};
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: string) => {
          f[c] = v;
          return q;
        },
        order: () => Promise.resolve({ data: h.meRows, error: null }),
        maybeSingle: async () => ({ data: h.targetRow, error: null }),
        update: (patch: { status: string }) => ({
          eq: (_c1: string, hid: string) => ({
            eq: (_c2: string, uid: string) => {
              h.updated = { household_id: hid, user_id: uid, status: patch.status };
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
      return q;
    },
  }),
}));

import { removeHouseholdMember } from "@/modules/personal-profile/services/household-members-service";

beforeEach(() => {
  h.meRows = [{ household_id: "hh1", role: "owner" }];
  h.targetRow = { role: "adult", status: "active" };
  h.updated = null;
});

describe("removeHouseholdMember", () => {
  it("owner quita a un adult activo → status='removed' (no borra la fila)", async () => {
    await removeHouseholdMember("OTHER");
    expect(h.updated).toEqual({ household_id: "hh1", user_id: "OTHER", status: "removed" });
  });

  it("no podés removerte a vos mismo", async () => {
    await expect(removeHouseholdMember("ME")).rejects.toThrow(/vos mismo/i);
    expect(h.updated).toBeNull();
  });

  it("un no-owner (adult) NO puede remover", async () => {
    h.meRows = [{ household_id: "hh1", role: "adult" }];
    await expect(removeHouseholdMember("OTHER")).rejects.toThrow(/titular/i);
    expect(h.updated).toBeNull();
  });

  it("no se puede quitar al OWNER", async () => {
    h.targetRow = { role: "owner", status: "active" };
    await expect(removeHouseholdMember("OTHER")).rejects.toThrow(/titular/i);
    expect(h.updated).toBeNull();
  });

  it("miembro inexistente/ya removido → error, sin update", async () => {
    h.targetRow = null;
    await expect(removeHouseholdMember("GHOST")).rejects.toThrow(/no está/i);
    expect(h.updated).toBeNull();
  });
});
