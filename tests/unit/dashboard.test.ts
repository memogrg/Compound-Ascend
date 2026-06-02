import { describe, it, expect } from "vitest";
import { computeBaseIndicators } from "@/modules/financial-base/engine/base-engine";
import { computeHealthScore } from "@/modules/financial-base/engine/health";
import { buildInsights } from "@/modules/dashboard/engine/insights";
import type { IncomeSource, ExpenseItem } from "@/modules/financial-base/types";

const inc = (amountMonthly: number): IncomeSource => ({
  id: "i",
  name: "Salario",
  incomeType: "activo",
  amount: amountMonthly,
  currency: "CRC",
  frequency: "mensual",
  isFixed: true,
  ownerScope: "usuario",
  includeInBudget: true,
  amountMonthly,
});
const exp = (nature: ExpenseItem["nature"], amountMonthly: number): ExpenseItem => ({
  id: Math.random().toString(),
  name: "g",
  nature,
  amount: amountMonthly,
  currency: "CRC",
  frequency: "mensual",
  isFixed: true,
  ownerScope: "usuario",
  amountMonthly,
});

describe("computeHealthScore", () => {
  it("sin datos => 0 y FRÁGIL", () => {
    const h = computeHealthScore(computeBaseIndicators([], []));
    expect(h.hasData).toBe(false);
    expect(h.score).toBe(0);
  });

  it("buena salud con ahorro alto y sin deuda", () => {
    const ind = computeBaseIndicators([inc(1000)], [exp("esencial", 400), exp("ahorro", 300)]);
    const h = computeHealthScore(ind);
    expect(h.hasData).toBe(true);
    expect(h.score).toBeGreaterThan(70);
    expect(h.bars).toHaveLength(4);
  });

  it("salud baja con flujo negativo", () => {
    const ind = computeBaseIndicators([inc(500)], [exp("esencial", 800)]);
    const h = computeHealthScore(ind);
    expect(h.score).toBeLessThan(50);
  });
});

describe("buildInsights", () => {
  it("guía a construir base cuando no hay datos", () => {
    const ind = computeBaseIndicators([], []);
    const out = buildInsights(ind, computeHealthScore(ind), "CRC");
    expect(out.nextBestAction).toContain("ingreso principal");
  });

  it("prioriza detener fuga con flujo negativo", () => {
    const ind = computeBaseIndicators([inc(500)], [exp("esencial", 800)]);
    const out = buildInsights(ind, computeHealthScore(ind), "CRC");
    expect(out.nextBestAction.toLowerCase()).toContain("fuga");
    expect(out.insights.length).toBeGreaterThan(0);
  });
});
