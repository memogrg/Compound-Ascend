import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/auth-context";
import { syncInsights, getInsightsFreshness } from "@/lib/insights/insights-service";
import type { DetectedInsight } from "@/lib/insights/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Seam de la costura AuthContext en insights (F1a · módulo 4). Con un `ctx` inyectado, el
 * servicio resuelve db/userId vía resolveAuth(ctx) — SIN sesión (no requireUser). syncInsights
 * es el write de reconciliación de la campana: el upsert nace con user_id = ctx.userId. La
 * verificación DB-bound completa (reconciliar por (kind, related_id) contra Postgres) → F1c.
 */

function fakeDb(): { db: SupabaseClient<Database>; upserted: unknown[] } {
  const upserted: unknown[] = [];
  const builder = () => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    Object.assign(b, {
      select: self,
      eq: self,
      order: self,
      limit: self,
      upsert: (rows: unknown) => {
        upserted.push(rows);
        return Promise.resolve({ error: null });
      },
      update: self,
      maybeSingle: async () => ({ data: null }),
      // Las queries de lectura (dismissed/actives, household_members) se awaitan directo.
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: [] }).then(resolve, reject),
    });
    return b;
  };
  const db = { from: () => builder() } as unknown as SupabaseClient<Database>;
  return { db, upserted };
}

describe("syncInsights · con AuthContext inyectado", () => {
  it("upserta el insight como ctx.userId, sin sesión (no requireUser)", async () => {
    const { db, upserted } = fakeDb();
    const ctx: AuthContext = { db, userId: "u_insights_5" };
    const detected: DetectedInsight[] = [
      {
        kind: "deuda_creciendo",
        severity: "media",
        title: "Tu deuda creció",
        body: "…",
        relatedId: null,
      } as unknown as DetectedInsight,
    ];

    // Si el seam NO usara ctx, aquí requireUser() lanzaría (no hay sesión en el test).
    await syncInsights(detected, ctx);

    expect(upserted).toHaveLength(1);
    const rows = upserted[0] as Array<{ user_id: string; kind: string }>;
    expect(rows[0]?.user_id).toBe("u_insights_5");
    expect(rows[0]?.kind).toBe("deuda_creciendo");
  });
});

describe("getInsightsFreshness · con AuthContext inyectado", () => {
  it("lee la frescura vía ctx.db sin sesión (no lanza; sin filas → null)", async () => {
    const { db } = fakeDb();
    const ctx: AuthContext = { db, userId: "u_insights_5" };
    await expect(getInsightsFreshness(ctx)).resolves.toBeNull();
  });
});
