/**
 * P2 · contradicción deuda-saldada. El asesor recomendaba "abonar" a una deuda ya en ₡0 porque los
 * 4 lectores del asesor filtraban/elegían/topeaban sobre `debts.balance` — el ANCLA de alta, que
 * `record_debt_payment` nunca decrementa— en vez del saldo VIVO derivado (ancla − pagos).
 *
 * Estos tests mockean SOLO la capa CRUDA (listDebts = ancla, listDebtPaymentsByDebt = pagos): la
 * derivación real (getCurrentDebtBalances → currentDebtBalance → recomputeFromPayments) corre encima.
 * Así se prueba ancla≠vivo de punta a punta: ancla ₡500.000 + un abono de ₡500.000 ⇒ saldo vivo 0.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  debts: [] as Record<string, unknown>[],
  payments: {} as Record<string, unknown[]>,
}));

// Capa cruda: el ancla y los pagos. La derivación NO se mockea — corre de verdad.
vi.mock("@/modules/control/services/control-service", () => ({
  listDebts: async () => h.debts,
  listDebtPaymentsByDebt: async () => h.payments,
  listDebtPaymentDatesThisMonth: async () => ({}),
}));

// debts-service y surplus importan financial-base; getCurrentDebtBalances no lo usa (stub mínimo).
vi.mock("@/modules/financial-base", () => ({
  getBaseSummary: async () => ({ indicators: { freeCashflow: 100_000, incomeMonthly: 500_000 } }),
  getDisplayCurrency: async () => "CRC",
}));

// surplus: fondos de defensa cubiertos (para llegar a la comparación) + FX identidad.
vi.mock("@/modules/wealth/services/fund-sizing-service", () => ({
  getDefenseFundsReport: async () => ({ activeFund: "done" }),
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));

import { getCurrentDebtBalances } from "@/modules/control/services/debts-service";
import { resolveActionProposal } from "@/lib/ai/action-resolver";
import { getSurplusDecision } from "@/modules/wealth/services/surplus-decision-service";

/** Deuda esqueleto: solo los campos que leen currentDebtBalance + effectiveApr. Tasa fija (rateType
 *  null → effectiveApr = apr); sin cuota mensual para que el recompute no acumule interés ordinario. */
function debt(over: Record<string, unknown>): Record<string, unknown> {
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
  };
}

const SALDADA = debt({ id: "d-saldada", name: "Tarjeta saldada", balance: 500_000, apr: 30 });
const ACTIVA = debt({ id: "d-activa", name: "Préstamo activo", balance: 300_000, apr: 18 });
// Un abono directo a capital de ₡500.000 salda el ancla de ₡500.000 (interés 0, no la cuota del mes).
const PAGO_500K = [
  { paymentDate: "2026-03-10", amount: 500_000, extraAmount: 0, kind: "extraordinario" as const },
];

const CTX = { currency: "CRC", today: "2026-08-25" };

beforeEach(() => {
  h.debts = [];
  h.payments = {};
});

describe("P2 deuda-saldada · el asesor lee el saldo VIVO, no el ancla de alta", () => {
  it("getCurrentDebtBalances deriva 0 para la deuda saldada por pagos; la activa conserva su saldo", async () => {
    h.debts = [SALDADA, ACTIVA];
    h.payments = { "d-saldada": PAGO_500K }; // la activa no tiene pagos
    const balances = await getCurrentDebtBalances();
    const saldada = balances.find((d) => d.id === "d-saldada")!;
    const activa = balances.find((d) => d.id === "d-activa")!;
    expect(saldada.currentBalance).toBe(0); // ancla 500k − abono 500k = 0
    expect(activa.currentBalance).toBe(300_000); // sin pagos → vivo = ancla
  });

  it("action-resolver: NO propone abono a una deuda saldada (única deuda, saldo vivo 0)", async () => {
    h.debts = [SALDADA];
    h.payments = { "d-saldada": PAGO_500K };
    const out = await resolveActionProposal(
      { type: "debt_extra_payment", payload: { amount: 100_000 } },
      CTX,
    );
    expect(out).toBeNull(); // saldada filtrada (≤0) → no hay candidata para abonar
  });

  it("action-resolver: SÍ propone abono a la deuda ACTIVA y topea al saldo vivo (control positivo)", async () => {
    h.debts = [ACTIVA];
    h.payments = {}; // sin pagos → saldo vivo = ancla 300k
    const out = await resolveActionProposal(
      { type: "debt_extra_payment", payload: { amount: 5_000_000 } },
      CTX,
    );
    expect(out?.payload).toMatchObject({ debtId: "d-activa", amount: 300_000, balance: 300_000 });
  });

  it("context-engine: la lectura+predicado del bloque de deudas (getCurrentDebtBalances, currentBalance>0) excluye la saldada de debtCount/debtTotals", async () => {
    h.debts = [SALDADA, ACTIVA];
    h.payments = { "d-saldada": PAGO_500K };
    // Réplica exacta de lo que hace buildFinancialContext: misma lectura, mismo filtro, mismo monto.
    const debts = (await getCurrentDebtBalances()).filter((d) => d.currentBalance > 0);
    expect(debts.map((d) => d.id)).toEqual(["d-activa"]); // debtCount = 1, la saldada no cuenta
    const totalDebtTotals = debts.reduce((s, d) => s + Math.round(d.currentBalance), 0);
    expect(totalDebtTotals).toBe(300_000); // el total del contexto = el DERIVADO, no el ancla (800k)
  });

  it("surplus (comparar_abonar_vs_invertir): con la única deuda saldada, el lado ABONAR queda vacío", async () => {
    h.debts = [SALDADA];
    h.payments = { "d-saldada": PAGO_500K };
    const report = await getSurplusDecision();
    expect(report.debtName).toBeNull(); // no hay deuda que abonar → sin objetivo de abono
  });

  it("verificación #3: el debtTotals del contexto = total DERIVADO (cierra la sobreestimación del ancla)", async () => {
    // Deuda parcialmente pagada: ancla 500k − abono 200k = vivo 300k. El contexto ANTES sumaba el
    // ancla (500k, sobreestimación gruesa); AHORA suma el vivo (300k), idéntico al que muestran
    // /deudas y Patrimonio (mismo currentDebtBalance canónico).
    h.debts = [debt({ id: "d-parcial", name: "Hipoteca", balance: 500_000 })];
    h.payments = {
      "d-parcial": [
        {
          paymentDate: "2026-02-01",
          amount: 200_000,
          extraAmount: 0,
          kind: "extraordinario" as const,
        },
      ],
    };
    const debts = (await getCurrentDebtBalances()).filter((d) => d.currentBalance > 0);
    const debtTotal = debts.reduce((s, d) => s + Math.round(d.currentBalance), 0);
    expect(debtTotal).toBe(300_000); // DERIVADO, no el ancla (500k)
  });
});
