import { describe, it, expect } from "vitest";
import { buildPanel } from "@/modules/dashboard/engine/pillars";
import type { BaseIndicators } from "@/modules/financial-base";

const ind = {
  incomeMonthly: 1000,
  expenseMonthly: 800,
  freeCashflow: 200,
  savingsRate: 0.08,
  investmentRate: 0.05,
  debtWeight: 0.35,
  essentialsWeight: 0.5,
  lifestyleWeight: 0.1,
  annualCoverage: 50,
  financialPressure: "media",
  incomeByType: {},
  expenseByNature: {},
} as unknown as BaseIndicators;

describe("buildPanel", () => {
  it("devuelve los 4 pilares en orden y degrada sin módulos", () => {
    const { norte, pillars } = buildPanel({
      ind,
      currency: "CRC",
      control: null,
      richLife: null,
      wealth: null,
    });
    expect(pillars.map((p) => p.key)).toEqual(["flujo", "ahorro", "deudas", "inversiones"]);
    expect(norte.trend).toBe("sin_historico");
    expect(pillars[3]!.value).toBe("—"); // sin wealth → inversiones sin dato
  });

  it("la deuda alta dispara la lectura de presión", () => {
    const { pillars } = buildPanel({
      ind,
      currency: "CRC",
      control: null,
      richLife: null,
      wealth: null,
    });
    const deudas = pillars.find((p) => p.key === "deudas")!;
    expect(deudas.ai).toMatch(/libera flujo/);
  });
});
