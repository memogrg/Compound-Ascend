import { describe, it, expect } from "vitest";
import {
  detectStalledGoals,
  detectGrowingDebt,
  detectPositiveStreak,
  detectDisfruteSpike,
} from "@/lib/insights/detectors";
import type { SavingsGoal, Debt } from "@/modules/control/types";

const goal = (g: Partial<SavingsGoal>): SavingsGoal => ({
  id: "g",
  name: "Meta",
  targetAmount: 1000,
  currentAmount: 0,
  monthlyContribution: 0,
  currency: "CRC",
  status: "saludable",
  ...g,
});

const debt = (d: Partial<Debt>): Debt => ({
  id: "d",
  name: "Deuda",
  balance: 1000,
  minPayment: 50,
  currentPayment: 50,
  apr: 30,
  currency: "CRC",
  isCurrent: true,
  ...d,
});

/** Fecha ISO ~12 meses en el futuro (para casos con ritmo). */
function inOneYear(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

describe("detectStalledGoals", () => {
  it("meta con status 'atrasado' → meta_estancada", () => {
    const out = detectStalledGoals([goal({ id: "g1", status: "atrasado" })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("meta_estancada");
    expect(out[0]?.relatedId).toBe("g1");
  });

  it("ritmo insuficiente para la fecha → meta_estancada", () => {
    const out = detectStalledGoals([
      goal({ id: "g2", targetAmount: 12000, currentAmount: 0, monthlyContribution: 100, targetDate: inOneYear() }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("meta_estancada");
  });

  it("meta saludable y a tiempo → nada", () => {
    const out = detectStalledGoals([
      goal({ targetAmount: 1200, currentAmount: 200, monthlyContribution: 1000, targetDate: inOneYear() }),
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("detectGrowingDebt", () => {
  it("delinquency '31_60' → deuda_creciendo", () => {
    const out = detectGrowingDebt([debt({ id: "d1", delinquency: "31_60", balance: 5000 })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("deuda_creciendo");
    expect(out[0]?.severity).toBe("accionar");
    expect(out[0]?.metric).toBe(5000);
  });

  it("delinquency 'no' → nada", () => {
    expect(detectGrowingDebt([debt({ delinquency: "no" })])).toHaveLength(0);
  });
});

describe("detectPositiveStreak", () => {
  it("meta al 85% → racha_positiva (cerca)", () => {
    const out = detectPositiveStreak([goal({ targetAmount: 1000, currentAmount: 850 })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("racha_positiva");
    expect(out[0]?.metric).toBe(85);
    expect(out[0]?.title).toContain("muy cerca");
  });

  it("meta al 100% → copy '¡Lograste…!'", () => {
    const out = detectPositiveStreak([goal({ name: "Fondo", targetAmount: 1000, currentAmount: 1000 })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toContain("Lograste");
  });

  it("meta por debajo del 80% → nada", () => {
    expect(detectPositiveStreak([goal({ targetAmount: 1000, currentAmount: 700 })])).toHaveLength(0);
  });
});

describe("detectDisfruteSpike", () => {
  it("current justo en +30% (130 sobre 100) → NO dispara (umbral estricto)", () => {
    expect(detectDisfruteSpike({ current: 130, priorAvg: 100 })).toHaveLength(0);
  });

  it("current por encima de +30% (140 sobre 100) → dispara", () => {
    const out = detectDisfruteSpike({ current: 140, priorAvg: 100, categoryId: "c1" });
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("gasto_disfrute_alza");
    expect(out[0]?.severity).toBe("observar");
    expect(out[0]?.relatedKind).toBe("category");
    expect(out[0]?.relatedId).toBe("c1");
    expect(out[0]?.metric).toBe(140);
  });

  it("priorAvg 0 (sin historial) → NO dispara", () => {
    expect(detectDisfruteSpike({ current: 500, priorAvg: 0 })).toHaveLength(0);
  });
});
