import { describe, it, expect } from "vitest";
import { normalizeHoldings } from "@/modules/wealth/services/portfolio-service";
import {
  computeHoldingPerformance,
  cashflowMonthlyIncome,
} from "@/modules/wealth/engine/portfolio-engine";
import type { Holding } from "@/modules/wealth/types";

const rates = { USD: 1, CRC: 455 };

// Activo NO cotizado (inmueble) en USD, con valor manual y renta en USD.
const casaUSD: Holding = {
  id: "casa",
  symbol: "CASA",
  assetType: "inmueble",
  quantity: 1,
  averageCost: 100_000,
  currency: "USD",
  currentValueManual: 150_000,
  rentalIncome: 500,
  rentalFrequency: "mensual",
};

describe("normalizeHoldings · moneda", () => {
  it("convierte averageCost, currentValueManual y rentalIncome a principal", () => {
    const [h] = normalizeHoldings([casaUSD], "CRC", rates);
    expect(h!.averageCost).toBe(45_500_000); // 100k × 455
    expect(h!.currentValueManual).toBe(68_250_000); // 150k × 455
    expect(h!.rentalIncome).toBe(227_500); // 500 × 455
  });

  it("deja null como null", () => {
    const [h] = normalizeHoldings(
      [{ ...casaUSD, currentValueManual: null, rentalIncome: null }],
      "CRC",
      rates,
    );
    expect(h!.currentValueManual).toBeNull();
    expect(h!.rentalIncome).toBeNull();
  });
});

describe("computeHoldingPerformance · no cotizado en otra moneda", () => {
  it("currentValue/profitLoss salen en principal (no el crudo nativo)", () => {
    const [h] = normalizeHoldings([casaUSD], "CRC", rates);
    const perf = computeHoldingPerformance(h!); // sin precio (no cotizado)
    expect(perf.currentValue).toBe(68_250_000); // NO 150_000
    expect(perf.costBasis).toBe(45_500_000);
    expect(perf.profitLoss).toBe(22_750_000);
    expect(perf.returnPct).toBeCloseTo(0.5, 6);
  });

  it("invariante a la moneda: mismo holding nativo → mismo returnPct y valor equivalente por FX", () => {
    const inCRC = computeHoldingPerformance(normalizeHoldings([casaUSD], "CRC", rates)[0]!);
    const inUSD = computeHoldingPerformance(normalizeHoldings([casaUSD], "USD", rates)[0]!);
    expect(inUSD.currentValue).toBe(150_000); // ya en USD, sin tocar
    expect(inCRC.currentValue).toBeCloseTo(inUSD.currentValue * rates.CRC, 0);
    expect(inCRC.returnPct).toBeCloseTo(inUSD.returnPct, 6);
  });
});

describe("cashflowMonthlyIncome · rentas en monedas mixtas", () => {
  it("suma montos ya convertidos a principal", () => {
    const crcRent: Holding = {
      id: "local",
      symbol: "LOCAL",
      assetType: "inmueble",
      quantity: 1,
      averageCost: 0,
      currency: "CRC",
      currentValueManual: 0,
      rentalIncome: 91_000,
      rentalFrequency: "mensual",
    };
    const norm = normalizeHoldings([casaUSD, crcRent], "CRC", rates);
    const perfs = norm.map((h) => computeHoldingPerformance(h));
    // 500 USD × 455 = 227_500 + 91_000 CRC = 318_500 / mes
    expect(cashflowMonthlyIncome(perfs)).toBe(318_500);
  });
});
