import { describe, it, expect, vi, beforeEach } from "vitest";

// CONCENTRACIÓN CANÓNICA en el contexto del asesor: sale del motor (concentrations()), sobre TODAS
// las posiciones. El detalle por posición se recorta para no inflar el prompt, pero el HHI y los
// porcentajes NO: se calculan sobre todas, y el contexto dice cuántas quedaron fuera del listado.

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

vi.mock("@/modules/financial-base/services/base-service", () => ({
  getBaseSummary: async () => ({
    indicators: {
      incomeMonthly: 1_000_000,
      expenseMonthly: 600_000,
      freeCashflow: 400_000,
      savingsRate: 0.4,
      expenseByNature: { esencial: 600_000 },
    },
    incomes: [],
    expenses: [],
    monedasVistas: ["CRC"],
  }),
  getPrimaryCurrency: async () => "CRC",
  getDisplayCurrency: async () => "CRC",
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({ USD: 1, CRC: 500 }) }));

/** Una posición como la entrega el motor (HoldingPerformance), en moneda primaria. */
const hp = (symbol: string, assetType: string, currency: string, currentValue: number) => ({
  id: symbol,
  symbol,
  label: symbol,
  assetType,
  currency,
  quantity: 1,
  averageCost: currentValue,
  costBasis: currentValue,
  currentValue,
  currentPrice: currentValue,
  profitLoss: 0,
  returnPct: 0,
  priceUnavailable: false,
  region: null,
});

let HOLDINGS = [hp("BTC", "cripto", "CRC", 7_000), hp("CASA", "inmueble", "CRC", 3_000)];
const slice = (label: string, value: number, pct: number) => ({ label, value, pct, color: "#000" });
vi.mock("@/modules/wealth/services/portfolio-service", () => ({
  getPortfolioReport: async () => ({
    currency: "CRC",
    analytics: {
      totalPortfolioValue: HOLDINGS.reduce((a, h) => a + h.currentValue, 0),
      totalCostBasis: HOLDINGS.reduce((a, h) => a + h.costBasis, 0),
      totalProfitLoss: 0,
      totalReturnPct: 0,
      growthScore: 72,
      allocation: {
        etf: slice("ETF", 0, 0),
        stock: slice("Acciones", 0, 0),
        crypto: slice("Cripto", 7_000, 0.7),
        cash: slice("Efectivo", 0, 0),
        other: slice("Otros", 3_000, 0.3),
      },
      holdingsWithPerformance: HOLDINGS,
    },
  }),
}));

const skip = async () => {
  throw new Error("mock: bloque best-effort omitido");
};
vi.mock("@/modules/rich-life/services/rich-life-service", () => ({ getRichLifeSummary: skip }));
vi.mock("@/modules/financial-base/services/snapshot-service", () => ({ getSnapshotHistory: skip }));
vi.mock("@/modules/wealth/services/snapshot-service", () => ({ getSnapshotHistory: skip }));
vi.mock("@/modules/wealth", () => ({
  getPatrimonioReport: skip,
  getDefenseFundsReport: skip,
  getMacroInsights: skip,
}));
vi.mock("@/modules/financial-base", () => ({ getEnvelopesSummary: skip }));
vi.mock("@/modules/control/services/control-service", () => ({ listDebts: async () => [] }));
vi.mock("@/lib/economic-indicators/insights", () => ({ getYoYInflation: async () => null }));
vi.mock("@/lib/economic-indicators", () => ({
  getLatest: async () => null,
  getChange: async () => ({ absChange: null }),
}));

import { buildFinancialContext } from "@/lib/ai/context-engine";

beforeEach(() => {
  vi.clearAllMocks();
  HOLDINGS = [hp("BTC", "cripto", "CRC", 7_000), hp("CASA", "inmueble", "CRC", 3_000)];
});

describe("buildFinancialContext · concentración canónica como HECHO (no como tool)", () => {
  it("trae las cuatro dimensiones del motor + el growth score", async () => {
    const c = (await buildFinancialContext()).concentracion;
    expect(c).toBeDefined();
    expect(c!.moneda).toBe("CRC");
    expect(c!.porPosicion.map((s) => s.label)).toEqual(["BTC", "CASA"]);
    expect(c!.porTipo.map((s) => s.label)).toEqual(["Cripto", "Otros"]); // solo buckets con valor
    expect(c!.porRegion.length).toBeGreaterThan(0);
    expect((await buildFinancialContext()).growthScore).toBe(72);
  });

  it("la exposición por moneda es la de COTIZACIÓN: el BTC registrado en CRC cuenta como USD", async () => {
    const c = (await buildFinancialContext()).concentracion!;
    expect(c.porMoneda.map((s) => s.label)).toEqual(["USD", "CRC"]);
    expect(c.porMoneda[0]).toMatchObject({ label: "USD", pct: 0.7 });
  });

  it("top1/top3/HHI salen del motor sobre TODAS las posiciones", async () => {
    const c = (await buildFinancialContext()).concentracion!;
    expect(c.top1Pct).toBeCloseTo(0.7, 5);
    expect(c.top3Pct).toBeCloseTo(1, 5);
    expect(c.hhi).toBeCloseTo(0.7 ** 2 + 0.3 ** 2, 5); // 0,58
  });

  it("con muchas posiciones recorta el DETALLE, pero el HHI y los % siguen incluyendo todas", async () => {
    HOLDINGS = Array.from({ length: 20 }, (_, i) => hp(`S${i}`, "accion", "USD", 100));
    const c = (await buildFinancialContext()).concentracion!;

    expect(c.porPosicion).toHaveLength(8); // el tope del prompt
    expect(c.slicesOmitidas).toBe(12); // y lo DICE, no las esconde
    // 20 posiciones iguales → cada una 5%; HHI = 20 × 0,05² = 0,05 (no 8 × 0,05²).
    expect(c.hhi).toBeCloseTo(0.05, 5);
    expect(c.top3Pct).toBeCloseTo(0.15, 5);
  });

  it("sin posiciones no se inventa la sección", async () => {
    HOLDINGS = [];
    expect((await buildFinancialContext()).concentracion).toBeUndefined();
  });
});
