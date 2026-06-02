import { describe, it, expect } from "vitest";
import {
  computeReadiness,
  computeProtection,
  computePortfolio,
} from "@/modules/wealth/engine/wealth-engine";
import { isValidSymbol } from "@/lib/market-data/symbol";
import { priceCache } from "@/lib/market-data/cache";
import type { Investment, InsurancePolicy, WealthContext } from "@/modules/wealth/types";

const ctx = (p: Partial<WealthContext>): WealthContext => ({
  freeCashflow: 100,
  hasEmergencyFund: true,
  hasCriticalDebt: false,
  dependents: 0,
  riskClassKnown: true,
  currency: "CRC",
  ...p,
});

describe("computeReadiness", () => {
  it("bloquea (no_listo/rojo) sin fondo de emergencia", () => {
    const r = computeReadiness(ctx({ hasEmergencyFund: false }), []);
    expect(r.state).toBe("no_listo");
    expect(r.semaforo).toBe("rojo");
  });
  it("sugiere empezar pequeño con base sana y sin inversiones", () => {
    const r = computeReadiness(ctx({}), []);
    expect(r.state).toBe("empezar_pequeno");
    expect(r.semaforo).toBe("amarillo");
  });
});

describe("computeProtection", () => {
  it("detecta brecha de vida si hay dependientes y sin póliza", () => {
    const diag = computeProtection(ctx({ dependents: 2 }), []);
    expect(diag.gaps.some((g) => /vida/i.test(g.type))).toBe(true);
    expect(diag.score).toBeLessThan(100);
  });
  it("score sube con coberturas", () => {
    const policies: InsurancePolicy[] = [
      { id: "1", policyType: "medico", currency: "CRC", coverage: 1000, premium: 10, premiumFrequency: "mensual" },
      { id: "2", policyType: "incapacidad", currency: "CRC", coverage: 1000 },
    ];
    const diag = computeProtection(ctx({ dependents: 0 }), policies);
    expect(diag.activePolicies).toBe(2);
    expect(diag.annualPremium).toBe(120);
  });
});

describe("computePortfolio", () => {
  it("calcula distribución y diversificación", () => {
    const invs: Investment[] = [
      { id: "1", assetType: "etf", name: "VOO", investedAmount: 1000, contribution: 100, currency: "CRC" },
      { id: "2", assetType: "cripto", name: "BTC", investedAmount: 1000, contribution: 0, currency: "CRC" },
    ];
    const pf = computePortfolio(invs);
    expect(pf.totalInvested).toBe(2000);
    expect(pf.distribution).toHaveLength(2);
    expect(pf.topConcentration).toBeCloseTo(0.5);
  });
});

describe("market-data", () => {
  it("valida símbolos", () => {
    expect(isValidSymbol("AAPL")).toBe(true);
    expect(isValidSymbol("BRK.B")).toBe(true);
    expect(isValidSymbol("BAD SYMBOL!")).toBe(false);
    expect(isValidSymbol("")).toBe(false);
  });
  it("cache guarda y recupera", () => {
    priceCache.set("k1", { price: 10 }, 60);
    expect(priceCache.get<{ price: number }>("k1")?.price).toBe(10);
    expect(priceCache.get("missing")).toBeNull();
  });
});
