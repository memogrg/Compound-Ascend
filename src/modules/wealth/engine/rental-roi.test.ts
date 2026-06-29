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

  it("descuenta la cuota de la deuda en el flujo apalancado (sin tocar el ROI operativo)", () => {
    const base = {
      rentalIncome: 1000,
      rentalFrequency: "mensual" as const,
      vacancyPct: 0.2,
      mgmtPct: 0.1,
      maintenanceMonthly: 50,
      hoaMonthly: 0,
      servicesMonthly: 0,
      propertyTaxAnnual: 120,
      insuranceAnnual: 0,
      investedCash: 100_000,
    };
    const sinDeuda = computeRentalRoi(base);
    expect(sinDeuda.debtServiceMonthly).toBe(0);
    expect(sinDeuda.leveredNetMonthly).toBeCloseTo(660); // = netMonthly cuando no hay deuda

    const conDeuda = computeRentalRoi({ ...base, debtServiceMonthly: 450 });
    expect(conDeuda.netMonthly).toBeCloseTo(660); // NOI no cambia
    expect(conDeuda.operatingRoi).toBeCloseTo(0.0792); // ROI operativo no cambia
    expect(conDeuda.debtServiceMonthly).toBe(450);
    expect(conDeuda.leveredNetMonthly).toBeCloseTo(210); // 660 - 450
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
