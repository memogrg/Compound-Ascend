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

// #655 · el precio en vivo y el gasto del mes se stubean; recordContributionPurchaseTx queda REAL
// (es lo que escribe investment_transactions, lo que probamos acá).
vi.mock("@/lib/market-data", async (orig) => ({
  ...(await orig<typeof import("@/lib/market-data")>()),
  getMarketPrice: async () => ({ price: 100, currency: "USD" }),
}));
vi.mock("@/modules/wealth/services/holdings-service", async (orig) => ({
  ...(await orig<typeof import("@/modules/wealth/services/holdings-service")>()),
  registerPurchaseExpense: async () => "exp1",
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

/**
 * #655 · el auto-aporte escribe el historial DCA (investment_transactions 'compra'), igual que una
 * compra manual. El fakeDb con ESTADO devuelve las filas crudas y simula el índice único de
 * `holding_contributions (holding_id, period)` (23505 en la 2ª reserva): así corre la lógica real
 * de ensureMonthlyContributions + recordContributionPurchaseTx encima, sin BD.
 */
function makeStatefulDb(holdings: Record<string, unknown>[]) {
  const reserved = new Set<string>(); // (holding:period) ya reservados → simula el único
  const investmentTx: Record<string, unknown>[] = []; // inserts capturados

  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let insertRes: { data: unknown; error: unknown } = { data: null, error: null };
    const b: Record<string, unknown> = {};
    Object.assign(b, {
      select: () => b,
      eq: () => b,
      in: () => b,
      gt: () => b,
      order: () => b,
      limit: () => b,
      update: () => {
        op = "update";
        return b;
      },
      delete: () => {
        op = "delete";
        return b;
      },
      insert: (row: Record<string, unknown>) => {
        op = "insert";
        if (table === "holding_contributions") {
          const key = `${row.holding_id}:${row.period_year}-${row.period_month}`;
          if (reserved.has(key)) {
            insertRes = { data: null, error: { code: "23505", message: "dup" } };
          } else {
            reserved.add(key);
            insertRes = { data: { id: `c-${key}` }, error: null };
          }
        } else if (table === "investment_transactions") {
          investmentTx.push(row);
          insertRes = { data: null, error: null };
        }
        return b;
      },
      maybeSingle: async () => (op === "insert" ? insertRes : { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (op === "insert") return Promise.resolve(insertRes).then(resolve);
        if (op === "select" && table === "investment_holdings") {
          return Promise.resolve({ data: holdings, error: null }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    });
    return b;
  };

  return { db: { from } as unknown as SupabaseClient<Database>, investmentTx };
}

const HOLDING = {
  id: "h1",
  symbol: "VOO",
  asset_type: "etf",
  currency: "USD",
  label: "S&P 500",
  quantity: 0,
  average_cost: 0,
  monthly_contribution: 100, // qty = 100/100 = 1 al precio 100
  household_id: "hh1",
};

describe("ensureMonthlyContributions · historial DCA en investment_transactions (#655)", () => {
  it("el auto-aporte escribe UNA fila 'compra' con las unidades del mes, en la moneda del holding", async () => {
    const { db, investmentTx } = makeStatefulDb([{ ...HOLDING }]);
    await ensureMonthlyContributions({ db, userId: "u_dca_1" });

    expect(investmentTx).toHaveLength(1);
    expect(investmentTx[0]).toMatchObject({
      user_id: "u_dca_1",
      household_id: "hh1",
      holding_id: "h1",
      tx_type: "compra",
      amount: 100, // = qty * price = el aporte mensual
      quantity: 1, // unidades compradas al precio del mes
      currency: "USD", // moneda nativa del holding
    });
    // Fecha = el 1º del período (mismo día que el gasto del mes).
    expect(investmentTx[0]!.occurred_on).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("re-correr NO duplica: la 2ª reserva da 23505 → el cuerpo se salta → sigue 1 sola fila", async () => {
    const { db, investmentTx } = makeStatefulDb([{ ...HOLDING }]);
    await ensureMonthlyContributions({ db, userId: "u_dca_1" }); // reserva + escribe
    await ensureMonthlyContributions({ db, userId: "u_dca_1" }); // 23505 → salta antes del merge

    expect(investmentTx).toHaveLength(1);
  });
});
