import { describe, it, expect } from "vitest";
import { buildPanel } from "@/modules/dashboard/engine/pillars";
import { buildDashboardKpis } from "@/modules/dashboard/engine/kpis";
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

const sinFuentes = buildDashboardKpis({
  currency: "CRC",
  monthFlow: null,
  patrimonio: null,
  richLife: null,
  deudas: null,
  portafolio: null,
});

describe("buildPanel", () => {
  it("devuelve los 4 pilares en orden y degrada sin motores", () => {
    const { norte, pillars } = buildPanel({ ind, kpis: sinFuentes });
    expect(pillars.map((p) => p.key)).toEqual(["flujo", "ahorro", "deudas", "inversiones"]);
    expect(norte.trend).toBe("sin_historico");
    // Sin fuentes NADA se pinta como cero: los cuatro dicen "no cargó".
    expect(pillars.every((p) => p.value === "—" && p.sinDato)).toBe(true);
  });

  it("sin fuente de libertad el porcentaje es null, nunca 0%", () => {
    const { norte } = buildPanel({ ind, kpis: sinFuentes });
    expect(norte.freedomPct).toBeNull();
    expect(norte.freedomText).not.toMatch(/0\s*%/);
  });

  it("la deuda alta dispara la lectura de presión, con el DTI de la tabla debts", () => {
    const kpis = buildDashboardKpis({
      currency: "CRC",
      monthFlow: null,
      patrimonio: null,
      richLife: null,
      deudas: { saldos: [500_000], incomeMonthly: 1000, pagoMensual: 350, metodo: "avalancha" },
      portafolio: null,
    });
    const deudas = buildPanel({ ind, kpis }).pillars.find((p) => p.key === "deudas")!;
    expect(deudas.ai).toMatch(/libera flujo/);
    expect(deudas.meta).toMatch(/Avalancha/);
  });
});
