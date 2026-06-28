import { describe, it, expect } from "vitest";
import { computeRentalRoi } from "@/modules/wealth/engine/rental-roi";

describe("computeRentalRoi", () => {
  it("descuenta vacancia, administración y costos fijos", () => {
    const r = computeRentalRoi({
      rentalIncome: 1000,
      rentalFrequency: "mensual",
      vacancyPct: 0.2, // -200 → cobra 800
      mgmtPct: 0.1, // -80
      maintenanceMonthly: 50,
      hoaMonthly: 0,
      servicesMonthly: 0,
      propertyTaxAnnual: 120, // -10/mes
      insuranceAnnual: 0,
      investedCash: 100_000,
    });
    expect(r.grossMonthly).toBe(1000);
    expect(r.vacancyLoss).toBe(200);
    expect(r.mgmtCost).toBeCloseTo(80);
    expect(r.netMonthly).toBeCloseTo(660); // 800 - 80 - (50+10)
    expect(r.noiAnnual).toBeCloseTo(7920);
    expect(r.operatingRoi).toBeCloseTo(0.0792);
  });

  it("sin efectivo invertido el ROI es 0 (no divide por cero)", () => {
    const r = computeRentalRoi({
      rentalIncome: 500, rentalFrequency: "mensual", vacancyPct: 0, mgmtPct: 0,
      maintenanceMonthly: 0, hoaMonthly: 0, servicesMonthly: 0,
      propertyTaxAnnual: 0, insuranceAnnual: 0, investedCash: 0,
    });
    expect(r.operatingRoi).toBe(0);
  });
});
