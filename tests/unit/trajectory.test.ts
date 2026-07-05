import { describe, it, expect } from "vitest";
import { computeTrajectory, type MonthlyPoint, type PortfolioPoint } from "@/lib/ai/trajectory";

const m = (period: string, income: number, expense: number, freeCashflow: number): MonthlyPoint => ({
  period,
  income,
  expense,
  freeCashflow,
});

describe("trajectory · computeTrajectory (motor puro)", () => {
  it("menos de 3 meses de historia → undefined (no inventa tendencias)", () => {
    expect(computeTrajectory([m("2026-05", 1_000_000, 600_000, 400_000)])).toBeUndefined();
    expect(
      computeTrajectory([m("2026-04", 1_000_000, 600_000, 400_000), m("2026-05", 1_000_000, 600_000, 400_000)]),
    ).toBeUndefined();
  });

  it("tasa de ahorro cayendo → dir 'baja' y deltaPp negativo correcto", () => {
    // ingreso constante 1M; ahorro 40% → 30% → 20% ⇒ -20 pp.
    const t = computeTrajectory([
      m("2026-03", 1_000_000, 600_000, 400_000),
      m("2026-04", 1_000_000, 700_000, 300_000),
      m("2026-05", 1_000_000, 800_000, 200_000),
    ]);
    expect(t).toBeDefined();
    expect(t!.months).toBe(3);
    expect(t!.savingsRate).toEqual({ dir: "baja", deltaPp: -20 });
    // gasto subió de 600k a 800k ⇒ +33%.
    expect(t!.expense).toEqual({ dir: "sube", pct: 33 });
    expect(t!.netWorth).toBeUndefined(); // sin historia de portafolio
  });

  it("tasa de ahorro casi plana (<2 pp) → 'estable'", () => {
    const t = computeTrajectory([
      m("2026-03", 1_000_000, 600_000, 400_000),
      m("2026-04", 1_000_000, 598_000, 402_000),
      m("2026-05", 1_000_000, 595_000, 405_000),
    ]);
    // 40% → 40.5%: +0.5 pp < 2 → estable.
    expect(t!.savingsRate?.dir).toBe("estable");
    expect(t!.expense?.dir).toBe("estable"); // -1% < 3%
  });

  it("patrimonio del portafolio subiendo → netWorth dir 'sube' con % correcto", () => {
    const monthly = [
      m("2026-03", 1_000_000, 600_000, 400_000),
      m("2026-04", 1_000_000, 600_000, 400_000),
      m("2026-05", 1_000_000, 600_000, 400_000),
    ];
    const portfolio: PortfolioPoint[] = [
      { date: "2026-03-01", portfolioValue: 50_000_000, netWorth: 100_000_000 },
      { date: "2026-05-01", portfolioValue: 60_000_000, netWorth: 130_000_000 },
    ];
    const t = computeTrajectory(monthly, portfolio);
    expect(t!.netWorth).toEqual({ dir: "sube", pct: 30 });
    expect(t!.savingsRate?.dir).toBe("estable"); // ahorro constante
  });

  it("datos degenerados (ingreso 0, gasto 0, sin portafolio) → undefined", () => {
    const t = computeTrajectory([m("2026-03", 0, 0, 0), m("2026-04", 0, 0, 0), m("2026-05", 0, 0, 0)]);
    expect(t).toBeUndefined();
  });

  it("ingreso 0 en un extremo omite savingsRate pero conserva expense", () => {
    const t = computeTrajectory([
      m("2026-03", 0, 500_000, 0),
      m("2026-04", 1_000_000, 550_000, 450_000),
      m("2026-05", 1_000_000, 650_000, 350_000),
    ]);
    expect(t!.savingsRate).toBeUndefined(); // primer ingreso 0
    expect(t!.expense).toEqual({ dir: "sube", pct: 30 }); // 500k → 650k
  });
});
