import { describe, it, expect, vi, beforeEach } from "vitest";

// INDICADORES MACRO ≠ MONEDA DE VISUALIZACIÓN. La inflación que le importa al usuario es la de la
// moneda en la que GANA Y GASTA (la principal), no la que eligió en el toggle del topbar para mirar
// sus totales. Antes el IPC se elegía con ctx.currency (display desde #560): un tico con el switch
// en dólares recibía el IPC de EE. UU. como "su" inflación — y el prompt le ordena al asesor citarla
// al aconsejar sobre deuda e inversión.

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "u1", user_metadata: { display_name: "Memo" } }),
  isSupabaseConfigured: () => true,
}));

type QueryResult = { data: null; error: null };
const RESULT: QueryResult = { data: null, error: null };
const query = {
  select: () => query,
  eq: () => query,
  in: () => query,
  order: () => query,
  limit: () => query,
  maybeSingle: async () => RESULT,
  then: (resolve: (v: QueryResult) => void) => resolve(RESULT),
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: () => query }),
}));

// El bloque base define primaryCurrency y ctx.currency. `baseCae` simula que ese bloque falla.
let primary = "CRC";
let display = "USD";
let baseCae = false;
let monedasVistas: string[] = ["CRC"];
let hayTasas = true;
vi.mock("@/modules/financial-base/services/base-service", () => ({
  getBaseSummary: async () => {
    if (baseCae) throw new Error("base caída");
    return {
      indicators: {
        incomeMonthly: 1_000_000,
        expenseMonthly: 600_000,
        freeCashflow: 400_000,
        savingsRate: 0.4,
        expenseByNature: { esencial: 600_000 },
      },
      incomes: [],
      expenses: [],
      monedasVistas,
    };
  },
  getPrimaryCurrency: async () => primary,
  getDisplayCurrency: async () => display,
}));

vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => {
    if (!hayTasas) throw new Error("fx caído");
    return { USD: 1, CRC: 500 };
  },
}));

// El indicador bajo prueba: qué CÓDIGO de IPC se pide.
const getYoYInflation = vi.fn(async (_code: string) => 0.04);
vi.mock("@/lib/economic-indicators/insights", () => ({
  getYoYInflation: (code: string) => getYoYInflation(code),
}));
vi.mock("@/lib/economic-indicators", () => ({
  getLatest: async () => null,
  getChange: async () => ({ absChange: null }),
}));

const skip = async () => {
  throw new Error("mock: bloque best-effort omitido");
};
vi.mock("@/modules/rich-life/services/rich-life-service", () => ({ getRichLifeSummary: skip }));
vi.mock("@/modules/wealth/services/portfolio-service", () => ({ getPortfolioReport: skip }));
vi.mock("@/modules/financial-base/services/snapshot-service", () => ({ getSnapshotHistory: skip }));
vi.mock("@/modules/wealth/services/snapshot-service", () => ({ getSnapshotHistory: skip }));
const FONDO = { current: 500_000, target: 1_500_000, progressPct: 0.33, recommendedMonthly: 100_000, covered: false };
vi.mock("@/modules/wealth", () => ({
  getPatrimonioReport: skip,
  getMacroInsights: skip,
  getDefenseFundsReport: async () => ({
    currency: "CRC",
    activeFund: "emergency",
    emergency: FONDO,
    emergencyRegistered: true,
    peace: FONDO,
    peaceRegistered: false,
  }),
}));
vi.mock("@/modules/financial-base", () => ({ getEnvelopesSummary: skip }));
vi.mock("@/modules/control/services/control-service", () => ({ listDebts: async () => [] }));

import { buildFinancialContext } from "@/lib/ai/context-engine";

beforeEach(() => {
  vi.clearAllMocks();
  primary = "CRC";
  display = "USD";
  baseCae = false;
  monedasVistas = ["CRC"];
  hayTasas = true;
});

describe("buildFinancialContext · el IPC sigue la moneda PRINCIPAL, no la de visualización", () => {
  it("primary=CRC + display=USD → pide 'IPC', NUNCA 'US_CPI'", async () => {
    const ctx = await buildFinancialContext();

    expect(getYoYInflation).toHaveBeenCalledWith("IPC");
    expect(getYoYInflation).not.toHaveBeenCalledWith("US_CPI");
    // El toggle de display no movió el indicador: el usuario vive en colones.
    expect(ctx.currency).toBe("USD");
    expect(ctx.inflacionYoYPct).toBe(4);
  });

  it("primary=USD → pide 'US_CPI' (aunque mire la app en colones)", async () => {
    primary = "USD";
    display = "CRC";
    await buildFinancialContext();

    expect(getYoYInflation).toHaveBeenCalledWith("US_CPI");
    expect(getYoYInflation).not.toHaveBeenCalledWith("IPC");
  });

  it("primary = display = CRC → 'IPC' (el caso común no cambia)", async () => {
    primary = "CRC";
    display = "CRC";
    await buildFinancialContext();
    expect(getYoYInflation).toHaveBeenCalledWith("IPC");
  });

  it("sin moneda principal (bloque base caído) → no se pide inflación: no se adivina", async () => {
    baseCae = true;
    const ctx = await buildFinancialContext();

    expect(getYoYInflation).not.toHaveBeenCalled();
    expect(ctx.inflacionYoYPct).toBeUndefined();
  });
});
