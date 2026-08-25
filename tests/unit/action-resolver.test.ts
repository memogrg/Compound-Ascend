/**
 * El resolver es lo que hace que una acción nacida de un CONSEJO sea segura de ejecutar con un
 * tap: el modelo dice nombres y montos, y acá se reconstruye el payload contra los datos REALES
 * del usuario. Lo que se prueba:
 *
 *  - el id SIEMPRE sale de la entidad real (nunca del modelo),
 *  - si la entidad no se resuelve, la acción se DESCARTA (mejor sin tarjeta que con una que
 *    apunta a nada),
 *  - los montos de referencia (saldo, presupuesto actual, aporte actual) salen del motor,
 *  - los tipos que ya existían pasan intactos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const holdings = vi.fn(async () => [
  {
    id: "11111111-1111-4111-8111-111111111111",
    symbol: "VOO",
    label: "Vanguard S&P 500",
    monthlyContribution: 100,
    currency: "USD",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    symbol: "BTC",
    label: "Bitcoin",
    monthlyContribution: 0,
    currency: "USD",
  },
]);
vi.mock("@/modules/wealth/services/holdings-service", () => ({ listHoldings: () => holdings() }));

// El resolver lee el saldo VIVO canónico (getCurrentDebtBalances), no el ancla de alta (P2
// deuda-saldada). El fixture entrega `currentBalance` derivado; el filtro ≤0 vive en el resolver.
const debts = vi.fn(async () => [
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Tarjeta BAC",
    currentBalance: 800_000,
    apr: 45,
    currency: "CRC",
    minPayment: 25_000,
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Préstamo personal",
    currentBalance: 2_000_000,
    apr: 18,
    currency: "CRC",
    minPayment: 80_000,
  },
]);
vi.mock("@/modules/control/services/debts-service", () => ({
  getCurrentDebtBalances: () => debts(),
}));

const sobres = vi.fn(async () => [
  { id: "55555555-5555-4555-8555-555555555555", sobre: "Restaurantes", frasco: "Vivir" },
  { id: "66666666-6666-4666-8666-666666666666", sobre: "Súper", frasco: "Vivir" },
]);
/** Tipado a mano para que un test pueda inyectar `nativeByKey` con `mockResolvedValueOnce`. */
type Totales = {
  currency: string;
  expenseByKey: Record<string, { label: string; value: number }>;
  nativeByKey?: Record<string, { label: string; value: number; currency: string; mixed?: boolean }>;
};
const budgetTotals = vi.fn(async (): Promise<Totales> => ({
  currency: "CRC",
  expenseByKey: {
    "55555555-5555-4555-8555-555555555555": { label: "Restaurantes", value: 100_000 },
  },
}));
vi.mock("@/modules/financial-base", () => ({
  listSobresForKind: () => sobres(),
  getBudgetTotals: () => budgetTotals(),
}));
vi.mock("@/lib/time/user-time", () => ({
  userCurrentPeriod: async () => ({ year: 2026, month: 8 }),
}));

import { resolveActionProposal } from "@/lib/ai/action-resolver";
import type { AIActionProposal } from "@/lib/ai/types";

const CTX = { currency: "CRC", today: "2026-08-03" };
const resolve = (a: AIActionProposal) => resolveActionProposal(a, CTX);

beforeEach(() => {
  holdings.mockClear();
  debts.mockClear();
  sobres.mockClear();
  budgetTotals.mockClear();
});

describe("set_dca · fijar el aporte mensual de una inversión", () => {
  it("resuelve el holdingId por símbolo y trae el aporte ACTUAL del dato real", async () => {
    const out = await resolve({
      type: "set_dca",
      payload: { symbol: "VOO", monthlyContribution: 200 },
    });
    expect(out?.payload).toMatchObject({
      holdingId: "11111111-1111-4111-8111-111111111111",
      monthlyContribution: 200,
      currentContribution: 100, // del motor, no del modelo
      currency: "USD", // la de la posición
    });
  });

  it("también resuelve por nombre de la posición", async () => {
    const out = await resolve({
      type: "set_dca",
      payload: { label: "Bitcoin", monthlyContribution: 50 },
    });
    expect(out?.payload.holdingId).toBe("22222222-2222-4222-8222-222222222222");
    expect(out?.payload.currentContribution).toBe(0);
  });

  it("una posición que NO tiene → se descarta (no se inventa un id)", async () => {
    expect(
      await resolve({ type: "set_dca", payload: { symbol: "TSLA", monthlyContribution: 100 } }),
    ).toBeNull();
  });

  it("sin monto no hay acción", async () => {
    expect(await resolve({ type: "set_dca", payload: { symbol: "VOO" } })).toBeNull();
  });

  it("IGNORA un holdingId que venga del modelo: el id sale de la búsqueda", async () => {
    const out = await resolve({
      type: "set_dca",
      payload: {
        holdingId: "99999999-9999-4999-8999-999999999999",
        symbol: "VOO",
        monthlyContribution: 200,
      },
    });
    expect(out?.payload.holdingId).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("adjust_budget · subir o bajar el presupuesto de un sobre", () => {
  it("resuelve el sobre y trae el presupuesto vigente del motor", async () => {
    const out = await resolve({
      type: "adjust_budget",
      payload: { name: "Restaurantes", amount: 150_000 },
    });
    expect(out?.payload).toMatchObject({
      categoryId: "55555555-5555-4555-8555-555555555555",
      amount: 150_000,
      currentAmount: 100_000,
      periodMonth: 8,
      periodYear: 2026,
      currency: "CRC",
    });
  });

  it('acepta la ruta completa "Frasco › Sobre"', async () => {
    const out = await resolve({
      type: "adjust_budget",
      payload: { categoryPath: "Vivir › Restaurantes", amount: 120_000 },
    });
    expect(out?.payload.categoryId).toBe("55555555-5555-4555-8555-555555555555");
  });

  it("un sobre sin presupuesto arranca de 0, no de una cifra inventada", async () => {
    const out = await resolve({
      type: "adjust_budget",
      payload: { name: "Súper", amount: 200_000 },
    });
    expect(out?.payload.currentAmount).toBe(0);
  });

  it("proponer EXACTAMENTE lo que ya tiene no es una acción: se descarta", async () => {
    expect(
      await resolve({ type: "adjust_budget", payload: { name: "Restaurantes", amount: 100_000 } }),
    ).toBeNull();
  });

  it("un sobre inexistente se descarta", async () => {
    expect(
      await resolve({ type: "adjust_budget", payload: { name: "Criptomonedas", amount: 50_000 } }),
    ).toBeNull();
  });
});

describe("debt_extra_payment · abono extra a capital", () => {
  it("resuelve la deuda por nombre y trae saldo y tasa reales", async () => {
    const out = await resolve({
      type: "debt_extra_payment",
      payload: { name: "Tarjeta BAC", amount: 100_000 },
    });
    expect(out?.payload).toMatchObject({
      debtId: "33333333-3333-4333-8333-333333333333",
      amount: 100_000,
      balance: 800_000,
      apr: 45,
      paymentDate: "2026-08-03",
    });
  });

  it("matchea parcial: «tarjeta» encuentra «Tarjeta BAC»", async () => {
    const out = await resolve({
      type: "debt_extra_payment",
      payload: { name: "tarjeta", amount: 50_000 },
    });
    expect(out?.payload.debtId).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("TOPEA el abono al saldo: no se propone pagar más de lo que se debe", async () => {
    const out = await resolve({
      type: "debt_extra_payment",
      payload: { name: "Tarjeta BAC", amount: 5_000_000 },
    });
    expect(out?.payload.amount).toBe(800_000);
  });

  it("sin nombre y con VARIAS deudas se descarta (adivinar cuál es inaceptable)", async () => {
    expect(await resolve({ type: "debt_extra_payment", payload: { amount: 100_000 } })).toBeNull();
  });

  it("sin nombre pero con UNA sola deuda, esa es", async () => {
    debts.mockResolvedValueOnce([
      {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Única",
        currentBalance: 500_000,
        apr: 30,
        currency: "CRC",
        minPayment: 20_000,
      },
    ]);
    const out = await resolve({ type: "debt_extra_payment", payload: { amount: 100_000 } });
    expect(out?.payload.debtId).toBe("77777777-7777-4777-8777-777777777777");
  });

  it("una deuda que no existe se descarta", async () => {
    expect(
      await resolve({ type: "debt_extra_payment", payload: { name: "Hipoteca", amount: 100_000 } }),
    ).toBeNull();
  });
});

describe("el resto no se toca", () => {
  it("los tipos que ya existían pasan intactos", async () => {
    const a: AIActionProposal = {
      type: "create_transaction",
      payload: { kind: "gasto", amount: 5000 },
      summary: "x",
    };
    expect(await resolve(a)).toEqual(a);
  });

  it("null entra y null sale", async () => {
    expect(await resolveActionProposal(null, CTX)).toBeNull();
  });

  it("si una lectura revienta, se cae la tarjeta pero no la respuesta", async () => {
    holdings.mockRejectedValueOnce(new Error("db caída"));
    expect(
      await resolve({ type: "set_dca", payload: { symbol: "VOO", monthlyContribution: 200 } }),
    ).toBeNull();
  });
});

/**
 * LA MONEDA DEL SOBRE en las tarjetas de acción. Acá no era solo un problema de lectura: la
 * `currency` del payload viaja a `setEnvelopeBudgetAction`, que la ESCRIBE en
 * `budget_items.currency`. Con la app en dólares, ajustar desde el chat un sobre configurado en
 * colones lo re-denominaba a USD en silencio y le multiplicaba el presupuesto por la tasa.
 */
describe("moneda nativa del sobre en adjust_budget / move_budget", () => {
  const REST = "55555555-5555-4555-8555-555555555555";
  const SUPER = "66666666-6666-4666-8666-666666666666";

  it("adjust_budget usa la moneda y el monto CONFIGURADOS, no los de visualización", async () => {
    budgetTotals.mockResolvedValueOnce({
      currency: "USD", // visualización
      expenseByKey: { [REST]: { label: "Restaurantes", value: 890 } },
      nativeByKey: { [REST]: { label: "Restaurantes", value: 445_000, currency: "CRC" } },
    });
    const out = await resolve({
      type: "adjust_budget",
      payload: { name: "Restaurantes", amount: 500_000 },
    });
    expect(out?.payload).toMatchObject({ currency: "CRC", currentAmount: 445_000 });
  });

  it("un presupuesto MIXTO no tiene moneda propia: cae a la de visualización", async () => {
    budgetTotals.mockResolvedValueOnce({
      currency: "USD",
      expenseByKey: { [REST]: { label: "Restaurantes", value: 890 } },
      nativeByKey: {
        [REST]: { label: "Restaurantes", value: 445_300, currency: "CRC", mixed: true },
      },
    });
    const out = await resolve({
      type: "adjust_budget",
      payload: { name: "Restaurantes", amount: 1_000 },
    });
    expect(out?.payload).toMatchObject({ currency: "USD", currentAmount: 890 });
  });

  it("move_budget entre sobres de la MISMA moneda: monto y moneda nativos", async () => {
    budgetTotals.mockResolvedValueOnce({
      currency: "USD",
      expenseByKey: {
        [REST]: { label: "Restaurantes", value: 890 },
        [SUPER]: { label: "Súper", value: 400 },
      },
      nativeByKey: {
        [REST]: { label: "Restaurantes", value: 445_000, currency: "CRC" },
        [SUPER]: { label: "Súper", value: 200_000, currency: "CRC" },
      },
    });
    const out = await resolve({
      type: "move_budget",
      payload: { from: "Restaurantes", to: "Súper", amount: 50_000 },
    });
    expect(out?.payload).toMatchObject({
      currency: "CRC",
      amount: 50_000,
      desdeActual: 445_000,
      hastaActual: 200_000,
    });
  });

  it("move_budget entre MONEDAS DISTINTAS se descarta: sería una conversión disfrazada", async () => {
    budgetTotals.mockResolvedValueOnce({
      currency: "USD",
      expenseByKey: {
        [REST]: { label: "Restaurantes", value: 890 },
        [SUPER]: { label: "Súper", value: 400 },
      },
      nativeByKey: {
        [REST]: { label: "Restaurantes", value: 445_000, currency: "CRC" },
        [SUPER]: { label: "Súper", value: 400, currency: "USD" },
      },
    });
    expect(
      await resolve({
        type: "move_budget",
        payload: { from: "Restaurantes", to: "Súper", amount: 50_000 },
      }),
    ).toBeNull();
  });
});
