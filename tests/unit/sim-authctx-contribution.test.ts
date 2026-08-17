import { describe, expect, it, vi } from "vitest";

import type { AuthContext } from "@/lib/auth/auth-context";
import { ensureMonthlyContributions } from "@/modules/wealth/services/contribution-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Seam de la costura AuthContext en el auto-DCA (F3a-DCA · issue #116). Con un `ctx`
 * inyectado, `ensureMonthlyContributions` resuelve db/userId vía resolveAuth(ctx) —
 * SIN sesión (no requireUser) — igual que `listOpenContributions` en el mismo archivo.
 * Si el seam NO usara ctx, requireUser() lanzaría (mockeado para fallar). Con holdings
 * vacíos no escribe nada; la verificación DB-bound (1 aporte/mes, merge, snapshots) la
 * hace el simulador contra la BD de PRUEBA.
 */
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => {
    throw new Error("requireUser NO debe llamarse con AuthContext inyectado");
  }),
  isSupabaseConfigured: () => true,
}));

function fakeDb(): { db: SupabaseClient<Database>; tables: string[] } {
  const tables: string[] = [];
  const builder = () => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    Object.assign(b, {
      select: self,
      eq: self,
      in: self,
      gt: self,
      order: self,
      limit: self,
      maybeSingle: async () => ({ data: null, error: null }),
      // La query de holdings recurrentes se awaita directo → sin filas, no escribe.
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    });
    return b;
  };
  const db = {
    from: (t: string) => {
      tables.push(t);
      return builder();
    },
  } as unknown as SupabaseClient<Database>;
  return { db, tables };
}

describe("ensureMonthlyContributions · con AuthContext inyectado", () => {
  it("usa ctx.db sin sesión (no requireUser); sin holdings recurrentes → no escribe", async () => {
    const { db, tables } = fakeDb();
    const ctx: AuthContext = { db, userId: "u_dca_1" };

    // Si el seam llamara requireUser(), esto lanzaría (mock arriba).
    await expect(ensureMonthlyContributions(ctx)).resolves.toBeUndefined();

    // Consultó los holdings con el cliente inyectado (no una sesión por cookies).
    expect(tables).toContain("investment_holdings");
  });
});
