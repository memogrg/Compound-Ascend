import { describe, it, expect } from "vitest";
import { unbudgetedExpenseShare } from "@/modules/financial-base/engine/budget-coverage";

describe("unbudgetedExpenseShare", () => {
  it("suma el gasto real en categorías sin presupuesto (budget ≤ 0)", () => {
    const real = { comida: { value: 300 }, ocio: { value: 200 }, imprevisto: { value: 100 } };
    const budget = { comida: { value: 350 }, ocio: { value: 0 } }; // imprevisto no tiene línea
    const r = unbudgetedExpenseShare(real, budget);
    // sin presupuesto: ocio (budget 0) + imprevisto (ausente) = 300; total = 600
    expect(r).toEqual({ unbudgeted: 300, total: 600, pct: 0.5 });
  });

  it("todo presupuestado → 0%", () => {
    const real = { a: { value: 100 }, b: { value: 100 } };
    const budget = { a: { value: 120 }, b: { value: 120 } };
    expect(unbudgetedExpenseShare(real, budget)).toEqual({ unbudgeted: 0, total: 200, pct: 0 });
  });

  it("nada presupuestado → 100%", () => {
    const real = { a: { value: 100 }, b: { value: 50 } };
    expect(unbudgetedExpenseShare(real, {})).toEqual({ unbudgeted: 150, total: 150, pct: 1 });
  });

  it("sin gasto → pct 0 (no divide por cero); ignora montos ≤ 0", () => {
    expect(unbudgetedExpenseShare({}, {})).toEqual({ unbudgeted: 0, total: 0, pct: 0 });
    expect(unbudgetedExpenseShare({ a: { value: 0 }, b: { value: -5 } }, {})).toEqual({
      unbudgeted: 0,
      total: 0,
      pct: 0,
    });
  });
});
