import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/auth-context";
import { createPolicy } from "@/modules/wealth/services/wealth-service";
import { payPolicyPremium } from "@/modules/wealth/services/wealth-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PolicyInput } from "@/modules/wealth/schemas";

/**
 * Seam de la costura AuthContext en wealth (F1a · módulo 3). Con un `ctx` inyectado, los
 * servicios resuelven db/userId vía resolveAuth(ctx) — SIN sesión (no requireUser). Se usan
 * caminos poco profundos (createPolicy = insert directo; payPolicyPremium hasta la guarda de
 * moneda) para probar el mecanismo en aislado. Lo DB-bound completo (el gasto vinculado del
 * pago de prima contra Postgres real) vive en F1c.
 */

function fakeDb(responses: Record<string, { data: unknown }>): {
  db: SupabaseClient<Database>;
  inserted: Record<string, unknown[]>;
} {
  const inserted: Record<string, unknown[]> = {};
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    Object.assign(b, {
      select: self,
      insert: (row: unknown) => {
        (inserted[table] ??= []).push(row);
        return b;
      },
      update: self,
      eq: self,
      in: self,
      order: self,
      single: async () => responses[table] ?? { data: null },
      maybeSingle: async () => responses[table] ?? { data: null },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(responses[table] ?? { data: [] }).then(resolve, reject),
    });
    return b;
  };
  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
  return { db, inserted };
}

describe("createPolicy · con AuthContext inyectado", () => {
  it("inserta la póliza como ctx.userId, sin sesión (no requireUser)", async () => {
    const { db, inserted } = fakeDb({ insurance_policies: { data: { id: "pol_1" } } });
    const ctx: AuthContext = { db, userId: "u_wealth_9" };

    const id = await createPolicy(
      { policyType: "vida", currency: "CRC" } as PolicyInput,
      ctx,
    );

    expect(id).toBe("pol_1");
    const rows = inserted.insurance_policies ?? [];
    expect(rows).toHaveLength(1);
    expect((rows[0] as { user_id: string }).user_id).toBe("u_wealth_9");
  });
});

describe("payPolicyPremium · con AuthContext inyectado", () => {
  it("lee la póliza vía ctx.db y aplica la guarda de moneda, sin sesión", async () => {
    // La póliza está en CRC; la prima viene en USD → corta en la guarda de moneda ANTES de
    // registrar el gasto vinculado. Prueba que resolvió {db,userId} del ctx (no requireUser)
    // y leyó la póliza por el cliente inyectado.
    const { db } = fakeDb({
      insurance_policies: { data: { id: "pol_1", provider: "X", currency: "CRC" } },
      household_members: { data: [] },
    });
    const ctx: AuthContext = { db, userId: "u_wealth_9" };

    await expect(
      payPolicyPremium(
        {
          policyId: "pol_1",
          policyName: "Vida",
          amount: 100,
          paymentDate: "2026-03-10",
          currency: "USD",
        },
        ctx,
      ),
    ).rejects.toThrow(/USD.*CRC/);
  });
});
