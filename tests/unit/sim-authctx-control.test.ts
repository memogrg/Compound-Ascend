import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/auth-context";
import { addDebtPayment } from "@/modules/control/services/control-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Seam de la costura AuthContext en control (F1a · módulo 2). Con un `ctx` inyectado,
 * addDebtPayment resuelve db/userId vía resolveAuth(ctx) — SIN sesión (no requireUser) y
 * escribiendo como ESE userId. Se usa el camino simple (total = 0 → insert directo de
 * debt_payments, sin la RPC atómica ni las reglas) para probar el mecanismo en aislado. La
 * verificación DB-bound completa (RPC record_debt_payment contra Postgres real) vive en F1c.
 */

function fakeDb(): { db: SupabaseClient<Database>; inserted: Record<string, unknown[]> } {
  const inserted: Record<string, unknown[]> = {};
  const debtRow = { id: "debt_1", name: "Tarjeta", currency: "CRC", created_at: "2026-01-01" };
  const responses: Record<string, { data: unknown }> = {
    debts: { data: debtRow }, // getDebt (select *) y el guard de escritura (select id)
    household_members: { data: [] }, // modo solo
    debt_payments: { data: null },
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
      eq: self,
      in: self,
      gte: self,
      order: self,
      maybeSingle: async () => responses[table] ?? { data: null },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(responses[table] ?? { data: [] }).then(resolve, reject),
    });
    return b;
  };
  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
  return { db, inserted };
}

describe("addDebtPayment · con AuthContext inyectado", () => {
  it("registra el pago como ctx.userId, sin sesión (no requireUser)", async () => {
    const { db, inserted } = fakeDb();
    const ctx: AuthContext = { db, userId: "u_control_7" };

    // total = amount + extraAmount = 0 → camino sin RPC ni transacción vinculada.
    // Si el seam NO usara ctx, aquí requireUser() lanzaría (no hay sesión en el test).
    await addDebtPayment(
      {
        debtId: "debt_1",
        amount: 0,
        extraAmount: 0,
        kind: "ordinario",
        paymentDate: "2026-03-10",
        currency: "CRC",
      },
      ctx,
    );

    const rows = inserted.debt_payments ?? [];
    expect(rows).toHaveLength(1);
    const row = rows[0] as { user_id: string; created_by: string; debt_id: string };
    expect(row.user_id).toBe("u_control_7"); // escribió como el userId inyectado
    expect(row.created_by).toBe("u_control_7");
    expect(row.debt_id).toBe("debt_1");
  });
});
