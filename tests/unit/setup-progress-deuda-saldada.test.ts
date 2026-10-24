/**
 * P2 · deuda-saldada en el HUB DE CONFIGURACIÓN (mismo linaje que la campana y el diagnóstico).
 * `_getSetupSnapshot` armaba `snapshot.debts` desde `listDebts()` — el ANCLA de alta, que
 * `record_debt_payment` NUNCA decrementa— así el detalle de "Control" decía
 * "3 deudas · Σ altas" aunque una ya estuviera saldada, y `nextAfterBudget` sugería abonarle
 * (ni siquiera filtraba saldo).
 *
 * Se mockea SOLO la capa CRUDA (listDebts = ancla, listDebtPaymentsByDebt = pagos) y los módulos
 * vecinos que el snapshot lee. La derivación real (getCurrentDebtBalances → recomputeFromPayments),
 * el mapeo real (`deriveDebtsForEngine`) y los motores puros del hub corren de verdad.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  debts: [] as Record<string, unknown>[],
  payments: {} as Record<string, unknown[]>,
}));

// Capa CRUDA de control. El resto del módulo queda real: getCurrentDebtBalances y
// deriveDebtsForEngine son los de producción.
vi.mock("@/modules/control/services/control-service", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    listDebts: async () => h.debts,
    listGoals: async () => [],
    listDebtPaymentsByDebt: async () => h.payments,
    listDebtPaymentDatesThisMonth: async () => ({}),
  };
});

vi.mock("@/modules/financial-base", () => ({
  getBudgetTotals: async () => null,
  getPrimaryCurrency: async () => "CRC",
  listCategoryTree: async () => [],
  monthPeriod: (year: number, month: number) => ({ year, month, from: "", to: "" }),
  getBaseSummary: async () => ({ indicators: { freeCashflow: 0, incomeMonthly: 0 } }),
  getDisplayCurrency: async () => "CRC",
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));
// El fondo de emergencia va CUBIERTO a propósito: `nextAfterBudget` corta en la regla 1 (defensa)
// antes de mirar deudas, así que sin esto los casos de deuda no se ejercitarían nunca.
const FONDO_CUBIERTO = {
  target: 500_000,
  current: 500_000,
  gap: 0,
  progressPct: 1,
  covered: true,
  recommendedMonthly: 0,
};
vi.mock("@/modules/wealth", () => ({
  getDefenseFundsReport: async () => ({
    emergency: FONDO_CUBIERTO,
    peace: { ...FONDO_CUBIERTO, months: 6 },
    emergencyRegistered: true,
    peaceRegistered: true,
  }),
  getDesiredMonthlyLifestyle: async () => null,
  listHoldings: async () => [],
  listPolicies: async () => [],
}));

import { controlSteps } from "@/modules/setup/engine/progress";
import { nextAfterBudget } from "@/modules/setup/engine/suggestions";

const BAC = {
  id: "d-bac",
  name: "Tarjeta BAC Visa",
  balance: 1_850_000,
  apr: 45,
  currency: "CRC",
  minPayment: 50_000,
  currentPayment: 0,
};
const AUTO = {
  id: "d-auto",
  name: "Préstamo auto",
  balance: 300_000,
  apr: 12,
  currency: "CRC",
  minPayment: 30_000,
  currentPayment: 0,
};
const PAGO_TOTAL = [
  { paymentDate: "2026-03-10", amount: 1_850_000, extraAmount: 0, kind: "extraordinario" as const },
];

beforeEach(() => {
  h.debts = [];
  h.payments = {};
  vi.resetModules();
});

/** `getSetupSnapshot` está envuelto en React cache: se reimporta para no leer el memo anterior. */
async function snapshot() {
  const mod = await import("@/modules/setup/services/setup-state");
  return mod.getSetupSnapshot();
}

describe("P2 deuda-saldada · el HUB lee el saldo VIVO, no el ancla de alta", () => {
  it("el snapshot trae el saldo vivo por deuda (saldada→0, activa intacta)", async () => {
    h.debts = [BAC, AUTO];
    h.payments = { "d-bac": PAGO_TOTAL };
    const s = await snapshot();
    expect(s.debts.find((d) => d.id === "d-bac")!.balance).toBe(0);
    expect(s.debts.find((d) => d.id === "d-auto")!.balance).toBe(300_000);
  });

  it("el detalle de Control suma los saldos VIVOS, no las altas", async () => {
    h.debts = [BAC, AUTO];
    h.payments = { "d-bac": PAGO_TOTAL };
    const detalle = controlSteps(await snapshot()).find((p) => p.id === "deudas")!.detail;
    // 2 filas cargadas (el conteo no cambia: las deudas siguen existiendo), pero Σ = 300.000.
    expect(detalle).toContain("2 deudas");
    expect(detalle).toContain("300");
    expect(detalle).not.toContain("2.150"); // Σ de las ANCLAS (1.850.000 + 300.000)
  });

  it("no sugiere abonar a una deuda cara ya saldada", async () => {
    h.debts = [BAC]; // apr 45 ≥ 20: antes entraba siempre, sin mirar saldo
    h.payments = { "d-bac": PAGO_TOTAL };
    const move = nextAfterBudget(await snapshot(), 100_000);
    expect(move?.text ?? "").not.toContain("Tarjeta BAC Visa");
  });

  it("una deuda cara VIVA sí se sigue sugiriendo", async () => {
    h.debts = [{ ...BAC, id: "d-viva" }];
    const move = nextAfterBudget(await snapshot(), 100_000);
    expect(move?.text ?? "").toContain("Tarjeta BAC Visa");
  });
});
