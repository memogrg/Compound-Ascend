import { describe, it, expect } from "vitest";
import {
  pmt,
  buildSchedule,
  compareExtra,
  solveExtraForTarget,
  applyExtraDecision,
  recomputeFromPayments,
  paysOff,
  type AmortizationInput,
} from "@/modules/control/engine/amortization";

describe("pmt", () => {
  it("r=0 reparte el saldo en n cuotas", () => {
    expect(pmt(1200, 0, 12)).toBe(100);
  });
  it("calcula la cuota nivelada estándar", () => {
    // B=10000, 12% anual (r=1% mensual), 12 meses → ≈ 888.49
    expect(pmt(10000, 0.01, 12)).toBeCloseTo(888.49, 1);
  });
});

describe("buildSchedule", () => {
  it("liquida en termMonths con la cuota derivada", () => {
    const input: AmortizationInput = { balance: 10000, apr: 12, termMonths: 12 };
    const rows = buildSchedule(input);
    expect(rows.length).toBe(12);
    expect(rows[rows.length - 1]!.balance).toBeLessThan(1);
    expect(paysOff(rows)).toBe(true);
  });

  it("con r=0 amortiza linealmente", () => {
    const rows = buildSchedule({ balance: 1200, apr: 0, termMonths: 12 });
    expect(rows.length).toBe(12);
    expect(rows[0]!.principal).toBe(100);
    expect(rows[0]!.interest).toBe(0);
  });

  it("el seguro se suma a la cuota y NO capitaliza", () => {
    const base = buildSchedule({ balance: 10000, apr: 12, termMonths: 12 });
    const withIns = buildSchedule({ balance: 10000, apr: 12, termMonths: 12, insurance: 50 });
    // mismo saldo mes a mes (el seguro no afecta el capital)
    expect(withIns[0]!.balance).toBeCloseTo(base[0]!.balance, 2);
    // pero la cuota total es mayor en el monto del seguro
    expect(withIns[0]!.payment).toBeCloseTo(base[0]!.payment + 50, 2);
    expect(withIns[0]!.insurance).toBe(50);
  });

  it("el pago extra mensual acorta el plazo", () => {
    const input: AmortizationInput = { balance: 20000, apr: 18, monthlyPayment: 500 };
    const base = buildSchedule(input);
    const fast = buildSchedule(input, { extraMonthly: 200 });
    expect(fast.length).toBeLessThan(base.length);
  });

  it("devuelve [] si la cuota no cubre el interés (infeasible)", () => {
    const rows = buildSchedule({ balance: 10000, apr: 24, monthlyPayment: 150 });
    // 150 < interés mensual (200) → no amortiza
    expect(rows.length).toBe(0);
  });
});

describe("compareExtra", () => {
  it("reporta meses e interés ahorrados con el extra", () => {
    const input: AmortizationInput = { balance: 30000, apr: 15, monthlyPayment: 600 };
    const cmp = compareExtra(input, 200, 30);
    expect(cmp.monthsSaved).toBeGreaterThan(0);
    expect(cmp.interestSaved).toBeGreaterThan(0);
    expect(cmp.newPayoffMonths).toBeLessThan(buildSchedule(input).length);
  });
});

describe("solveExtraForTarget", () => {
  it("encuentra el extra que liquida en el plazo objetivo", () => {
    const input: AmortizationInput = { balance: 30000, apr: 15, monthlyPayment: 600 };
    const baseMonths = buildSchedule(input).length;
    const target = baseMonths - 12;
    const extra = solveExtraForTarget(input, target);
    expect(extra).toBeGreaterThan(0);
    const months = buildSchedule(input, { extraMonthly: extra }).length;
    expect(months).toBeLessThanOrEqual(target);
  });

  it("devuelve 0 si ya se liquida a tiempo", () => {
    const input: AmortizationInput = { balance: 1000, apr: 10, monthlyPayment: 500 };
    expect(solveExtraForTarget(input, 12)).toBe(0);
  });
});

describe("applyExtraDecision", () => {
  const input: AmortizationInput = { balance: 20000, apr: 18, monthlyPayment: 500 };

  it("'tiempo' mantiene la cuota y acorta el plazo", () => {
    const base = buildSchedule(input);
    const d = applyExtraDecision(input, 3000, "tiempo");
    expect(d.monthlyPayment).toBeCloseTo(500, 0);
    expect(d.months).toBeLessThan(base.length);
  });

  it("'cuota' baja la cuota manteniendo el plazo", () => {
    const d = applyExtraDecision(input, 3000, "cuota");
    expect(d.monthlyPayment).toBeLessThan(500);
  });

  it("'tiempo' ahorra más interés que 'cuota'", () => {
    const tiempo = applyExtraDecision(input, 3000, "tiempo");
    const cuota = applyExtraDecision(input, 3000, "cuota");
    expect(tiempo.interestSaved).toBeGreaterThan(cuota.interestSaved);
  });
});

describe("recomputeFromPayments", () => {
  it("recalcula saldo y progreso desde los pagos reales", () => {
    const input: AmortizationInput = {
      balance: 10000,
      apr: 12,
      monthlyPayment: 500,
      originalAmount: 12000,
    };
    const res = recomputeFromPayments(input, [
      { paymentDate: "2026-01-01", amount: 500 },
      { paymentDate: "2026-02-01", amount: 500, extraAmount: 1000 },
    ]);
    expect(res.currentBalance).toBeLessThan(12000);
    expect(res.paidPrincipal).toBeGreaterThan(0);
    expect(res.progressPct).toBeGreaterThan(0);
    expect(res.progressPct).toBeLessThanOrEqual(1);
  });
});
