import { describe, it, expect, vi, beforeEach } from "vitest";

// DEUDAS EN SU MONEDA: cada deuda tiene la suya (Debt.currency). Sumar los saldos crudos daba un
// número que no existe — una tarjeta de $2.000 más un préstamo de ₡3.000.000 salían como
// "3.002.000 CRC". Acá se prueba que el contexto entrega SUBTOTALES por moneda, y que el total
// convertido solo aparece cuando hay tasas para todas las monedas.

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "u1", user_metadata: { display_name: "Memo" } }),
  isSupabaseConfigured: () => true,
}));

// Cliente de sesión falso: el resto de los bloques rinde {data:null} (best-effort vacío).
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
    indicators: { incomeMonthly: 1_000_000, expenseMonthly: 600_000, freeCashflow: 400_000 },
  }),
  getPrimaryCurrency: async () => "CRC",
  getDisplayCurrency: async () => "CRC",
}));

// FX: 1 USD = 500 CRC. `ratesDisponibles` en false simula la fuente caída (sin tasas).
let ratesDisponibles = true;
vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => {
    if (!ratesDisponibles) throw new Error("fx caído");
    return { USD: 1, CRC: 500 };
  },
}));

// Deudas del usuario (lo único que este test alimenta de verdad). El contexto lee el saldo VIVO
// canónico (getCurrentDebtBalances → currentBalance), NO el ancla de alta (P2 deuda-saldada).
type FakeDebt = {
  id: string;
  name: string;
  currentBalance: number;
  minPayment: number;
  apr: number | null;
  currency: string;
};
let DEBTS: FakeDebt[] = [];
vi.mock("@/modules/control/services/debts-service", () => ({
  getCurrentDebtBalances: async () => DEBTS,
}));

// Bloques best-effort que pegan a red: se saltan al instante (test hermético).
const skip = async () => {
  throw new Error("mock: bloque best-effort omitido");
};
vi.mock("@/modules/rich-life/services/rich-life-service", () => ({ getRichLifeSummary: skip }));
vi.mock("@/modules/wealth/services/portfolio-service", () => ({ getPortfolioReport: skip }));
vi.mock("@/modules/financial-base/services/snapshot-service", () => ({ getSnapshotHistory: skip }));
vi.mock("@/modules/wealth/services/snapshot-service", () => ({ getSnapshotHistory: skip }));
vi.mock("@/modules/wealth", () => ({ getPatrimonioReport: skip }));
vi.mock("@/modules/financial-base", () => ({ getEnvelopesSummary: skip }));

import { buildFinancialContext } from "@/lib/ai/context-engine";

const debt = (over: Partial<FakeDebt> = {}): FakeDebt => ({
  id: "d1",
  name: "Deuda",
  currentBalance: 1_000_000,
  minPayment: 50_000,
  apr: 20,
  currency: "CRC",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  ratesDisponibles = true;
  DEBTS = [];
});

describe("buildFinancialContext · deudas en la moneda de cada deuda", () => {
  it("tarjeta USD + préstamo CRC → DOS subtotales, nunca la suma cruda", async () => {
    DEBTS = [
      debt({ id: "d1", name: "Tarjeta", currentBalance: 2_000, currency: "USD", apr: 45 }),
      debt({ id: "d2", name: "Préstamo", currentBalance: 3_000_000, currency: "CRC", apr: 18 }),
    ];
    const ctx = await buildFinancialContext();

    expect(ctx.debtCount).toBe(2);
    expect(ctx.debtTotals).toEqual([
      { monto: 3_000_000, moneda: "CRC" },
      { monto: 2_000, moneda: "USD" },
    ]);
    // El número que NO puede existir: 2.000 dólares sumados a 3.000.000 de colones.
    expect(ctx.debtTotals?.some((m) => m.monto === 3_002_000)).toBe(false);
  });

  it("con tasas, el total convertido está presente y es coherente (2.000 USD = 1.000.000 CRC)", async () => {
    DEBTS = [
      debt({ id: "d1", name: "Tarjeta", currentBalance: 2_000, currency: "USD" }),
      debt({ id: "d2", name: "Préstamo", currentBalance: 3_000_000, currency: "CRC" }),
    ];
    const ctx = await buildFinancialContext();
    expect(ctx.debtTotalConvertido).toEqual({ monto: 4_000_000, moneda: "CRC" });
  });

  it("sin tasas → no hay total convertido, y ninguna cifra queda mal etiquetada", async () => {
    ratesDisponibles = false;
    DEBTS = [
      debt({ id: "d1", name: "Tarjeta", currentBalance: 2_000, currency: "USD" }),
      debt({ id: "d2", name: "Préstamo", currentBalance: 3_000_000, currency: "CRC" }),
    ];
    const ctx = await buildFinancialContext();

    expect(ctx.debtTotalConvertido).toBeUndefined();
    // Los subtotales siguen, cada uno con SU moneda: no se pierde el dato, solo el total.
    expect(ctx.debtTotals).toEqual([
      { monto: 3_000_000, moneda: "CRC" },
      { monto: 2_000, moneda: "USD" },
    ]);
  });

  it("una sola moneda → un solo subtotal (y el convertido no necesita tasas)", async () => {
    ratesDisponibles = false;
    DEBTS = [
      debt({ currentBalance: 850_000, currency: "CRC" }),
      debt({ id: "d2", currentBalance: 150_000, currency: "CRC" }),
    ];
    const ctx = await buildFinancialContext();

    expect(ctx.debtTotals).toEqual([{ monto: 1_000_000, moneda: "CRC" }]);
    expect(ctx.debtTotalConvertido).toEqual({ monto: 1_000_000, moneda: "CRC" });
  });

  it("la deuda de mayor APR viaja con su moneda (comparar tasas entre monedas engaña)", async () => {
    DEBTS = [
      debt({ id: "d1", name: "Tarjeta", currentBalance: 2_000, currency: "USD", apr: 45 }),
      debt({ id: "d2", name: "Préstamo", currentBalance: 3_000_000, currency: "CRC", apr: 18 }),
    ];
    const ctx = await buildFinancialContext();
    expect(ctx.topDebtName).toBe("Tarjeta");
    expect(ctx.topDebtApr).toBe(45);
    expect(ctx.topDebtCurrency).toBe("USD");
  });

  it("saldo 0 no cuenta como deuda activa", async () => {
    DEBTS = [debt({ currentBalance: 0 })];
    const ctx = await buildFinancialContext();
    expect(ctx.debtCount).toBeUndefined();
    expect(ctx.debtTotals).toBeUndefined();
  });
});
