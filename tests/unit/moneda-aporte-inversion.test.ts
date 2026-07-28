import { describe, it, expect } from "vitest";
import { convertCurrency } from "@/lib/fx";
import { planContribution } from "@/modules/wealth/engine/holding-contribution";

/**
 * Aportar a una inversión existente respeta la moneda del holding, para AMBOS tipos:
 *  - cotizado (etf/acción/cripto): promedia por cantidad = importe / precio, en su moneda.
 *  - no cotizado (certificado/inmueble…): sube invertido y valor por el importe, en su moneda.
 *
 * El hueco histórico: ningún test ejercitaba un aporte a un holding en moneda ≠ principal.
 * Aquí se fija con moneda principal CRC y holdings en USD; `convertCurrency` expresa el
 * valor-convertido-erróneo como aserción `.not`.
 */

const PRIMARY = "CRC";
const RATES = { USD: 1, CRC: 510 };

describe("planContribution — cotizado", () => {
  it("holding en USD (principal CRC): cantidad = importe/precio, en USD, sin convertir", () => {
    const holding = {
      assetType: "accion" as const,
      currency: "USD",
      quantity: 10,
      averageCost: 100,
      currentValueManual: null,
    };
    const plan = planContribution(holding, { amount: 500, unitPrice: 125 });

    expect(plan.kind).toBe("quoted");
    if (plan.kind !== "quoted") throw new Error("kind");
    expect(plan.currency).toBe("USD");
    expect(plan.quantity).toBeCloseTo(4, 6); // 500 / 125, en USD
    expect(plan.unitPrice).toBe(125);
    // Si se colara la conversión (importe a CRC / precio), la cantidad saldría absurda.
    expect(plan.quantity).not.toBeCloseTo(convertCurrency(500, "USD", PRIMARY, RATES) / 125, 0);
  });

  it("sin precio → falla (no se puede promediar el costo sin precio)", () => {
    const holding = {
      assetType: "etf" as const,
      currency: "USD",
      quantity: 5,
      averageCost: 100,
      currentValueManual: null,
    };
    expect(() => planContribution(holding, { amount: 500 })).toThrow();
  });
});

describe("planContribution — no cotizado (certificado)", () => {
  it("holding en USD: invertido y valor suben por el importe, en USD, sin convertir", () => {
    const holding = {
      assetType: "certificado" as const,
      currency: "USD",
      quantity: 1,
      averageCost: 2000,
      currentValueManual: 2200,
    };
    const plan = planContribution(holding, { amount: 800 });

    expect(plan.kind).toBe("manual");
    if (plan.kind !== "manual") throw new Error("kind");
    expect(plan.currency).toBe("USD");
    expect(plan.addedAmount).toBe(800);
    expect(plan.newInvested).toBeCloseTo(2800, 6); // 2000 + 800, en USD
    expect(plan.newValue).toBeCloseTo(3000, 6); // 2200 + 800, en USD
    // El certificado en USD no debe sumar CRC convertidos a su valor.
    expect(plan.newValue).not.toBeCloseTo(2200 + convertCurrency(800, "USD", PRIMARY, RATES), 0);
  });

  it("sin valor manual: parte del invertido (cantidad × costo)", () => {
    const holding = {
      assetType: "certificado" as const,
      currency: "USD",
      quantity: 1,
      averageCost: 2000,
      currentValueManual: null,
    };
    const plan = planContribution(holding, { amount: 800 });
    if (plan.kind !== "manual") throw new Error("kind");
    expect(plan.newValue).toBeCloseTo(2800, 6); // (1×2000) + 800
    expect(plan.newInvested).toBeCloseTo(2800, 6);
  });
});
