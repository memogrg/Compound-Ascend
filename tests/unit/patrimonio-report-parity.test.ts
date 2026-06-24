import { describe, it, expect, vi } from "vitest";

/**
 * Paridad: getPatrimonioReport() (sesión) y getPatrimonioReportForUser(userId)
 * (service-role) deben producir el MISMO {report, level, diagnosis} para el mismo
 * usuario y datos. Se mockea la sesión y el service-role al MISMO fake DB + el
 * mismo aggregateNetWorth, así cualquier divergencia vendría del threading de ctx.
 */
const UID = "11111111-1111-1111-1111-111111111111";

const AGG = {
  assets: [
    { id: "a1", name: "Inv", assetClass: "inversion", value: 100_000, currency: "CRC", generatesIncome: false },
    { id: "a2", name: "Casa cuenta", assetClass: "liquido", value: 50_000, currency: "CRC", generatesIncome: false },
  ],
  liabilities: [{ id: "l1", name: "Deuda", liabilityClass: "consumo", balance: 20_000, currency: "CRC" }],
  passiveIncomeMonthly: 1_000,
  monthlyExpenses: 30_000,
  netMonthlyIncome: 50_000,
  freeCashflow: 20_000,
  protection: { totalCoverage: 0, score: 30 },
  portfolio: { diversification: "media", topConcentration: 0.4 },
  currency: "CRC",
  explicitAssets: [],
  explicitLiabilities: [],
  previousNetWorth: null,
};

// Fake DB: chainable; responde lo mismo sin importar quién lo construya.
function fakeDb() {
  const rowsByTable: Record<string, unknown[]> = {
    debts: [],
    investments: [],
    savings_goals: [],
    personal_profiles: [{ age: 40 }],
  };
  return {
    from(table: string) {
      const data = rowsByTable[table] ?? [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: (data as unknown[])[0] ?? null }),
        then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: data as unknown[] }),
      };
      return builder;
    },
  };
}

const DB = fakeDb();

vi.mock("@/modules/rich-life", () => ({ aggregateNetWorth: vi.fn(async () => AGG) }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: vi.fn(async () => ({ USD: 1, CRC: 455 })) }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: UID })),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => DB) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: vi.fn(() => DB) }));

import { getPatrimonioReport, getPatrimonioReportForUser } from "@/modules/wealth/services/patrimonio-service";

describe("paridad getPatrimonioReport vs getPatrimonioReportForUser", () => {
  it("mismo {report, level, diagnosis, currency} para el mismo usuario/datos", async () => {
    const session = await getPatrimonioReport(); // ctx undefined → sesión
    const cron = await getPatrimonioReportForUser(UID); // service-role
    expect(cron).toEqual(session);
  });

  it("el reporte es coherente (no vacío) y en la moneda esperada", async () => {
    const cron = await getPatrimonioReportForUser(UID);
    expect(cron.currency).toBe("CRC");
    expect(cron.report.totalAssets).toBe(150_000);
    expect(cron.report.netWorth).toBe(130_000);
  });
});
