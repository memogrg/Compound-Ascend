/**
 * P2 · deuda-saldada en el DIAGNÓSTICO/ESTRATEGIA (mismo linaje que PR #670, que arregló el asesor).
 * `getControlSummary` armaba `debtsForEngine` desde `listDebts()` — el ANCLA de alta, que
 * `record_debt_payment` NUNCA decrementa— en vez del saldo VIVO derivado (ancla − pagos). Así una
 * deuda saldada (ancla>0, vivo=0) seguía entrando en `buildControlDiagnosis`:
 *   activeDebts = debts.filter(d => d.balance > 0)  → la contaba como activa,
 *   isCriticalDebt (apr≥30)                          → la marcaba como crítica (hasCriticalDebt),
 * y el asesor recomendaba "atacá tu deuda cara" sobre una deuda ya en ₡0.
 *
 * Igual que el test hermano `debt-saldada-no-abono.test.ts`, se mockea SOLO la capa CRUDA
 * (listDebts = ancla, listDebtPaymentsByDebt = pagos). La derivación real
 * (getCurrentDebtBalances → currentDebtBalance → recomputeFromPayments) y el mapeo real de
 * producción (`deriveDebtsForEngine`) corren encima, y el motor puro `buildControlDiagnosis`
 * decide sobre el resultado. Prueba ancla≠vivo de punta a punta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Debt, ControlContext } from "@/modules/control/types";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  debts: [] as Record<string, unknown>[],
  payments: {} as Record<string, unknown[]>,
}));

// Capa cruda (ancla + pagos). El resto de control-service queda REAL (importActual) para ejercer
// `deriveDebtsForEngine` de producción; getCurrentDebtBalances (debts-service) importa estas dos.
vi.mock("@/modules/control/services/control-service", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listDebts: async () => h.debts,
    listDebtPaymentsByDebt: async () => h.payments,
    listDebtPaymentDatesThisMonth: async () => ({}),
  };
});

// debts-service y control-service importan financial-base; el path de deudas no lo usa (stub mínimo).
vi.mock("@/modules/financial-base", () => ({
  getBaseSummary: async () => ({ indicators: { freeCashflow: 200_000, incomeMonthly: 800_000 } }),
  getDisplayCurrency: async () => "CRC",
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));

import { getCurrentDebtBalances } from "@/modules/control/services/debts-service";
import { deriveDebtsForEngine } from "@/modules/control/services/control-service";
import { buildControlDiagnosis } from "@/modules/control/engine/priority-engine";

/** Deuda esqueleto: sólo los campos que leen currentDebtBalance/effectiveApr y el motor. Tasa fija
 *  (rateType null → effectiveApr = apr); sin cuota mensual para que el recompute no acumule interés. */
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

const SALDADA = debt({ id: "d-saldada", name: "Tarjeta saldada", balance: 500_000, apr: 30 });
const ACTIVA = debt({ id: "d-activa", name: "Préstamo activo", balance: 300_000, apr: 18 });
// Un abono directo a capital de ₡500.000 salda el ancla de ₡500.000 (interés 0, no la cuota del mes).
const PAGO_500K = [
  { paymentDate: "2026-03-10", amount: 500_000, extraAmount: 0, kind: "extraordinario" as const },
];

// Flujo positivo + fondo cubierto: aísla el efecto de la deuda (sin ruido de flujo/emergencia).
const CTX: ControlContext = {
  freeCashflow: 200_000,
  hasEmergencyFund: true,
  discipline: 6,
  stress: 4,
};

/** Replica el wiring real de getControlSummary: ancla + pagos → saldo vivo → mapeo → motor. */
async function diagnoseFromRaw() {
  const live = await getCurrentDebtBalances();
  const debtsForEngine = deriveDebtsForEngine(h.debts as Debt[], live, "CRC", {});
  return buildControlDiagnosis([], debtsForEngine, CTX, "CRC");
}

beforeEach(() => {
  h.debts = [];
  h.payments = {};
});

describe("P2 deuda-saldada · el DIAGNÓSTICO lee el saldo VIVO, no el ancla de alta", () => {
  it("deriveDebtsForEngine reemplaza el ancla por el saldo vivo (saldada→0, activa intacta)", async () => {
    h.debts = [SALDADA, ACTIVA];
    h.payments = { "d-saldada": PAGO_500K };
    const live = await getCurrentDebtBalances();
    const mapped = deriveDebtsForEngine(h.debts as Debt[], live, "CRC", {});
    expect(mapped.find((d) => d.id === "d-saldada")!.balance).toBe(0); // ancla 500k − abono 500k
    expect(mapped.find((d) => d.id === "d-activa")!.balance).toBe(300_000); // sin pagos → = ancla
  });

  it("única deuda saldada (vivo 0): el motor NO la cuenta activa ni crítica, sin plan de abono", async () => {
    h.debts = [SALDADA];
    h.payments = { "d-saldada": PAGO_500K };
    const diag = await diagnoseFromRaw();
    expect(diag.debtMethod).toBeUndefined(); // 0 deudas activas → sin método de pago
    // hasCriticalDebt=false ⇒ ni línea de asignación ni narrativa de "deuda cara".
    expect(diag.allocation.some((i) => /deuda cara/i.test(i.label))).toBe(false);
    expect(diag.diagnosis).not.toMatch(/deuda cara/i);
  });

  it("saldada (vivo 0, apr 30) + activa (vivo 300k, apr 18): NO hay deuda crítica; la activa sí cuenta", async () => {
    h.debts = [SALDADA, ACTIVA];
    h.payments = { "d-saldada": PAGO_500K };
    const diag = await diagnoseFromRaw();
    expect(diag.debtMethod).toBeDefined(); // la activa sigue en juego (no barremos todo)
    // La apr 30 de la SALDADA ya no dispara "deuda cara" porque su saldo vivo es 0.
    expect(diag.allocation.some((i) => /deuda cara/i.test(i.label))).toBe(false);
    expect(diag.diagnosis).not.toMatch(/deuda cara/i);
  });
});
