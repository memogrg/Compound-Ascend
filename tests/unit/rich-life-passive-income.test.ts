vi.mock("@/lib/household/active", () => ({
  householdMemberIds: async (_c: unknown, uid: string) => [uid],
  getActiveHouseholdId: async () => null,
  isActiveHouseholdEditor: async () => true,
}));
import { describe, it, expect, vi } from "vitest";

/**
 * Cobertura de ingreso PASIVO: la renta/intereses que la app deriva de las inversiones
 * (alquiler, bonos, CDP, préstamos) vive en `budget_items` con source_kind='rental' y
 * NO en `income_sources` — rental-service registra el cobro "sin duplicar en
 * income_sources". Como el agregado solo leía la lista manual, quien tiene toda su renta
 * en entidades veía 0% de cobertura pasiva. Este test fija que ambas fuentes suman.
 */
const UID = "22222222-2222-2222-2222-222222222222";

const rowsByTable: Record<string, unknown[]> = {
  assets: [],
  liabilities: [],
  debts: [],
  investments: [],
  insurance_policies: [],
  personal_profiles: [],
  net_worth_snapshots: [],
  savings_goals: [],
  // Renta derivada del periodo: un alquiler y un cupón, en dos monedas.
  budget_items: [
    { amount: 1_445.75, currency: "USD" },
    { amount: 114_500, currency: "CRC" },
  ],
};

function fakeDb() {
  return {
    from(table: string) {
      const data = rowsByTable[table] ?? [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        lt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => ({ data: (data as unknown[])[0] ?? null }),
        then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: data as unknown[] }),
      };
      return builder;
    },
  };
}
const DB = fakeDb();

const RATES = { USD: 1, CRC: 500 };

vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => ({ id: UID }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => DB }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => RATES }));
vi.mock("@/lib/time/user-time", () => ({
  userCurrentPeriod: async () => ({ year: 2026, month: 8, from: "2026-08-01", to: "2026-08-31" }),
}));
vi.mock("@/modules/financial-base", () => ({
  getBaseSummary: async () => ({
    // Lista base vacía (el usuario presupuesta con sobres) + un ingreso pasivo manual.
    indicators: { incomeMonthly: 0, expenseMonthly: 0, freeCashflow: 0 },
    incomes: [
      {
        incomeType: "pasivo",
        includeInBudget: true,
        amountMonthly: 100,
        currency: "USD",
      },
      // Activo: no cuenta como pasivo.
      { incomeType: "activo", includeInBudget: true, amountMonthly: 5_000, currency: "USD" },
    ],
    expenses: [],
    monedasVistas: ["USD"],
  }),
  getDisplayCurrency: async () => "USD",
  getPrimaryCurrency: async () => "USD",
  getLiquidityBalance: async () => ({ balance: 0, currency: "USD", hasOpening: false }),
}));
// El compromiso se lee aparte (total-commitment-service); acá no es lo que se prueba.
vi.mock("@/modules/wealth/services/total-commitment-service", () => ({
  getTotalMonthlyCommitment: async () => ({
    total: 8_000,
    byOrigin: { sobres: 8_000, goals: 0, dca: 0, debts: 0, policies: 0 },
    excludedPolicies: [],
  }),
}));
vi.mock("@/modules/wealth/services/portfolio-service", () => ({
  getPortfolioMarketValues: async () => ({ byInvestmentId: {} }),
}));

import { aggregateNetWorth } from "@/modules/rich-life/services/rich-life-service";

describe("aggregateNetWorth · ingreso pasivo", () => {
  it("suma la renta derivada de inversiones a la lista manual de ingresos pasivos", async () => {
    const agg = await aggregateNetWorth();
    // 100 (manual) + 1.445,75 (alquiler USD) + 114.500/500 = 229 (cupón CRC) = 1.774,75
    expect(agg.passiveIncomeMonthly).toBeCloseTo(1_774.75, 2);
  });

  it("el compromiso viaja en el agregado para que todos usen el mismo denominador", async () => {
    const agg = await aggregateNetWorth();
    expect(agg.commitment?.total).toBe(8_000);
    expect(agg.monthlyExpenses).toBe(0); // la lista base sigue siendo lo que es
  });
});
