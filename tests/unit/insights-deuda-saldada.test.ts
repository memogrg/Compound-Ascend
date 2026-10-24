/**
 * P2 · deuda-saldada en la CAMPANA (mismo linaje que el diagnóstico y el asesor).
 * `refreshInsights` alimentaba los detectores con `listDebts()` — el ANCLA de alta, que
 * `record_debt_payment` NUNCA decrementa— así una tarjeta ya saldada (ancla>0, vivo=0) seguía
 * saliendo como "la deuda más cara", con su monto de alta, y se recomendaba abonarle:
 *   detectExpensiveDebt: debts.filter(d => … && d.balance > 0)  → la daba por viva,
 *                        body: `… sobre un saldo de ${peor.balance}` → imprimía el ancla.
 *
 * Igual que `debt-diagnosis-saldada.test.ts`, se mockea SOLO la capa CRUDA (listDebts = ancla,
 * listDebtPaymentsByDebt = pagos). La derivación real (getCurrentDebtBalances →
 * recomputeFromPayments) y el mapeo real de producción (`deriveDebtsForEngine`) corren encima, y
 * los detectores puros deciden sobre el resultado.
 *
 * La derivación va en la moneda NATIVA de cada deuda, como en insights-service: los detectores
 * formatean con `d.currency`, así que convertir acá rotularía mal el monto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Debt } from "@/modules/control/types";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  debts: [] as Record<string, unknown>[],
  payments: {} as Record<string, unknown[]>,
}));

vi.mock("@/modules/control/services/control-service", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listDebts: async () => h.debts,
    listDebtPaymentsByDebt: async () => h.payments,
    listDebtPaymentDatesThisMonth: async () => ({}),
  };
});

vi.mock("@/modules/financial-base", () => ({
  getBaseSummary: async () => ({ indicators: { freeCashflow: 200_000, incomeMonthly: 800_000 } }),
  getDisplayCurrency: async () => "CRC",
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));

import { getCurrentDebtBalances } from "@/modules/control/services/debts-service";
import { deriveDebtsForEngine } from "@/modules/control/services/control-service";
import { detectExpensiveDebt, detectGrowingDebt } from "@/lib/insights/detectors";

/** Deuda esqueleto: sólo los campos que leen currentDebtBalance y los detectores. */
function debt(over: Record<string, unknown>): Debt {
  return {
    id: "d",
    name: "Deuda",
    balance: 500_000,
    apr: 30,
    currency: "CRC",
    minPayment: 20_000,
    currentPayment: 0,
    insurance: 0,
    extraMonthly: 0,
    termMonths: null,
    startDate: null,
    originalAmount: null,
    rateType: null,
    rateIndex: null,
    rateSpread: null,
    introApr: null,
    introFixedMonths: null,
    classification: null,
    delinquency: undefined,
    ...over,
  } as unknown as Debt;
}

const BAC = debt({ id: "d-bac", name: "Tarjeta BAC Visa", balance: 1_850_000, apr: 45 });
const ACTIVA = debt({ id: "d-activa", name: "Préstamo activo", balance: 300_000, apr: 24 });
// Abono directo a capital que salda el ancla completa (interés 0, no la cuota del mes).
const PAGO_TOTAL = [
  { paymentDate: "2026-03-10", amount: 1_850_000, extraAmount: 0, kind: "extraordinario" as const },
];

/** Replica el wiring real de refreshInsights: ancla + pagos → saldo vivo → mapeo nativo. */
async function debtsVivas(): Promise<Debt[]> {
  const live = await getCurrentDebtBalances();
  return (h.debts as Debt[]).flatMap((d) => deriveDebtsForEngine([d], live, d.currency, {}));
}

beforeEach(() => {
  h.debts = [];
  h.payments = {};
});

describe("P2 deuda-saldada · la CAMPANA lee el saldo VIVO, no el ancla de alta", () => {
  it("la derivación reemplaza el ancla por el saldo vivo y conserva la moneda nativa", async () => {
    h.debts = [BAC, ACTIVA];
    h.payments = { "d-bac": PAGO_TOTAL };
    const vivas = await debtsVivas();
    expect(vivas.find((d) => d.id === "d-bac")!.balance).toBe(0);
    expect(vivas.find((d) => d.id === "d-activa")!.balance).toBe(300_000);
    expect(vivas.every((d) => d.currency === "CRC")).toBe(true);
  });

  it("única deuda saldada (vivo 0, apr 45): NO emite 'deuda cara'", async () => {
    h.debts = [BAC];
    h.payments = { "d-bac": PAGO_TOTAL };
    expect(detectExpensiveDebt(await debtsVivas())).toEqual([]);
  });

  it("saldada (apr 45) + activa (apr 24): la más cara es la ACTIVA, con su saldo vivo", async () => {
    h.debts = [BAC, ACTIVA];
    h.payments = { "d-bac": PAGO_TOTAL };
    const out = detectExpensiveDebt(await debtsVivas());
    expect(out).toHaveLength(1);
    expect(out[0]!.relatedId).toBe("d-activa");
    expect(out[0]!.body).toContain("300");
    expect(out[0]!.body).not.toContain("850");
  });

  it("con el ANCLA (sin derivar) el bug se reproduce: emite la saldada con su monto de alta", () => {
    // Testigo del regreso: es exactamente lo que hacía refreshInsights antes del fix.
    const out = detectExpensiveDebt([BAC, ACTIVA]);
    expect(out[0]!.relatedId).toBe("d-bac");
    expect(out[0]!.body).toContain("850");
  });

  it("deuda con atraso ya saldada: el metric del aviso es el saldo vivo, no el ancla", async () => {
    h.debts = [
      debt({ id: "d-bac", name: "Tarjeta BAC Visa", balance: 1_850_000, delinquency: "1_30" }),
    ];
    h.payments = { "d-bac": PAGO_TOTAL };
    const out = detectGrowingDebt(await debtsVivas());
    expect(out).toHaveLength(1);
    expect(out[0]!.metric).toBe(0);
  });
});
