import { describe, expect, it } from "vitest";

import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { createTransaction } from "@/modules/financial-base/services/transaction-service";
import { txnInputSchema } from "@/modules/financial-base/schemas";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Seam de la costura AuthContext en financial-base (F1a). Con un `ctx` inyectado, los
 * servicios resuelven db/userId vía `resolveAuth(ctx)` — SIN sesión HTTP (no llaman
 * requireUser) y escribiendo como ESE userId. La verificación DB-bound completa (contra
 * Postgres real) vive en el arnés F1c; aquí se prueba el mecanismo de resolución en aislado.
 */

describe("resolveAuth · contrato", () => {
  it("devuelve el ctx inyectado tal cual (sin tocar la sesión)", async () => {
    const ctx: AuthContext = { db: {} as unknown as SupabaseClient<Database>, userId: "u_seed" };
    expect(await resolveAuth(ctx)).toBe(ctx);
  });
});

/**
 * Fake mínimo de SupabaseClient: encadena como el builder real y captura los `insert`.
 * Respuestas canónicas por tabla para el camino más simple de createTransaction
 * (categoría y cuenta explícitas → sin reglas ni auto-categoría; sin vínculo).
 */
function fakeDb(): { db: SupabaseClient<Database>; inserted: Record<string, unknown[]> } {
  const inserted: Record<string, unknown[]> = {};
  const responses: Record<string, { data: unknown }> = {
    accounts: { data: { name: "Efectivo" } }, // accountLabelFor → maybeSingle
    household_members: { data: [] }, // getActiveHouseholdId → modo solo
    transactions: { data: { id: "txn_seed_1" } }, // insert().select().single()
    liquidity_ledger: { data: null },
  };
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
      delete: self,
      eq: self,
      in: self,
      gte: self,
      lte: self,
      order: self,
      range: self,
      maybeSingle: async () => responses[table] ?? { data: null },
      single: async () => responses[table] ?? { data: null },
      // Thenable: las queries que se awaitan sin maybeSingle/single (p. ej. household_members).
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(responses[table] ?? { data: [] }).then(resolve, reject),
    });
    return b;
  };
  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
  return { db, inserted };
}

describe("createTransaction · con AuthContext inyectado", () => {
  it("escribe la transacción como ctx.userId, sin sesión (no requireUser)", async () => {
    const { db, inserted } = fakeDb();
    const ctx: AuthContext = { db, userId: "u_synthetic_42" };
    const input = txnInputSchema.parse({
      kind: "gasto",
      amount: 12_500,
      currency: "CRC",
      occurredOn: "2026-03-10",
      categoryId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      status: "confirmed",
      origin: "manual",
    });

    // Si el seam NO usara ctx, aquí requireUser() lanzaría (no hay sesión en el test).
    const res = await createTransaction(input, ctx);

    expect(res.id).toBe("txn_seed_1");
    const rows = inserted.transactions ?? [];
    expect(rows).toHaveLength(1);
    const row = rows[0] as { user_id: string; created_by: string; amount: number };
    expect(row.user_id).toBe("u_synthetic_42"); // escribió como el userId inyectado
    expect(row.created_by).toBe("u_synthetic_42");
    expect(row.amount).toBe(12_500); // sin tocar la lógica de dinero
  });
});
