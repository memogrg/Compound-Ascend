import { describe, it, expect, vi, beforeEach } from "vitest";

// El contexto del asesor debe usar la moneda PRINCIPAL del usuario, NO el override
// de visualización (cookie ca_display_currency). Con primary=CRC y display=USD,
// buildFinancialContext debe dar ctx.currency='CRC' y los montos en CRC.

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "u1", user_metadata: { display_name: "Memo" } }),
  isSupabaseConfigured: () => true,
}));

// Cliente de sesión falso: cualquier query del resto de bloques rinde {data:null}
// (esos bloques quedan vacíos best-effort, sin romper el test).
type QueryResult = { data: null; error: null };
const RESULT: QueryResult = { data: null, error: null };
const query = {
  select: () => query,
  eq: () => query,
  order: () => query,
  limit: () => query,
  maybeSingle: async () => RESULT,
  then: (resolve: (v: QueryResult) => void) => resolve(RESULT),
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: () => query }),
}));

const getBaseSummary = vi.fn(async (_ctx?: unknown) => ({
  indicators: { incomeMonthly: 1_000_000, expenseMonthly: 600_000, freeCashflow: 400_000 },
}));
const getPrimaryCurrency = vi.fn(async (_ctx?: unknown) => "CRC");
const getDisplayCurrency = vi.fn(async () => "USD"); // el override; NO debe usarse
vi.mock("@/modules/financial-base/services/base-service", () => ({
  getBaseSummary: (ctx?: unknown) => getBaseSummary(ctx),
  getPrimaryCurrency: (ctx?: unknown) => getPrimaryCurrency(ctx),
  getDisplayCurrency: () => getDisplayCurrency(),
}));

import { buildFinancialContext } from "@/lib/ai/context-engine";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildFinancialContext · moneda principal (no display)", () => {
  it("primary=CRC + display=USD → ctx.currency='CRC' y montos en CRC", async () => {
    const ctx = await buildFinancialContext();

    expect(ctx.currency).toBe("CRC"); // principal, NO el override USD
    expect(ctx.incomeMonthly).toBe(1_000_000);
    expect(ctx.expenseMonthly).toBe(600_000);
    expect(ctx.freeCashflow).toBe(400_000);

    // El asesor NO consultó la moneda de visualización.
    expect(getDisplayCurrency).not.toHaveBeenCalled();
    // getBaseSummary recibió un AuthContext (con userId) → normaliza a la primaria.
    expect(getBaseSummary).toHaveBeenCalledTimes(1);
    const arg = getBaseSummary.mock.calls[0]![0] as { userId?: string } | undefined;
    expect(arg?.userId).toBe("u1");
  });
});
