/**
 * Fase 3 · ANTI-DEFANG suite — proves the (recalibrated) universal gates still BITE. Pure, no DB
 * (not gated on SUPABASE_TEST_*): feeds `evaluateGates` injected inputs and asserts a NaN is caught
 * by G2 and a broken accounting identity by G3 — and that a well-formed input stays green (no
 * over-firing). This guards against a green population run that's really just toothless gates.
 */
import { describe, it, expect } from "vitest";
import { evaluateGates, type GateInputs } from "./gates";

/** A well-formed, identity-satisfying persona: assets 1000 (liq 600 + inv 400), debts 300. */
const CLEAN: GateInputs = {
  netWorth: 700, // = 1000 assets − 300 liabilities
  totalAssets: 1000,
  totalLiabilities: 300,
  debtToAssets: 0.3,
  productiveAssetsPct: 0.4,
  liquidAssetsPct: 0.6,
  depreciablePct: 0,
  passiveIncomeCoverage: 0.2,
  financialFreedomIndex: 0.2,
  monthsOfIndependence: 3,
  wealthVelocity: 50,
  liquidity: 600,
  portfolioValue: 400,
  goals: [0],
  debts: [300],
};

describe("Fase 3 · anti-defang · los gates recalibrados MUERDEN", () => {
  it("input bien-formado → 0 hallazgos (no falsos positivos)", () => {
    expect(evaluateGates(CLEAN, false)).toEqual([]);
  });

  it("G2 caza un NaN inyectado en una métrica", () => {
    const withNaN: GateInputs = { ...CLEAN, debtToAssets: Number.NaN };
    const found = evaluateGates(withNaN, false);
    expect(found.some((x) => x.gate.startsWith("G2") && x.detail.includes("debtToAssets"))).toBe(true);
  });

  it("G2 caza un Infinity inyectado (que NO sea el centinela assetLiabilityRatio)", () => {
    const withInf: GateInputs = { ...CLEAN, monthsOfIndependence: Infinity };
    const found = evaluateGates(withInf, false);
    expect(found.some((x) => x.gate.startsWith("G2") && x.detail.includes("monthsOfIndependence"))).toBe(true);
  });

  it("G3 caza una identidad rota (neto ≠ activos − pasivos)", () => {
    const broken: GateInputs = { ...CLEAN, netWorth: 999 }; // 999 ≠ 1000 − 300 = 700
    const found = evaluateGates(broken, false);
    expect(found.some((x) => x.gate.startsWith("G3 neto") && x.severity === "P0")).toBe(true);
  });

  it("G3 caza una composición rota (liquidez+metas+inversiones−deudas ≠ neto)", () => {
    const broken: GateInputs = { ...CLEAN, liquidity: 5_000 }; // composición = 5000+0+400−300 = 5100 ≠ 700
    const found = evaluateGates(broken, false);
    expect(found.some((x) => x.gate.startsWith("G3 composición") && x.severity === "P0")).toBe(true);
  });

  it("G3 FX: tolerancia relativa NO tapa una coerción cruda/1:1 (deuda USD contada como 2000 en vez de ~1.02M CRC)", () => {
    // Persona FX: deuda USD 2000 → debería contar ~1.02M CRC. Si la app la coerciona cruda (2000),
    // pasivos=2000 pero Σdeudas(convertido)=1_020_000 → G3 debe morder pese a la tolerancia relativa.
    const fxRaw: GateInputs = {
      ...CLEAN,
      netWorth: 1_020_000 - 300, // como si activos correctos, pasivos crudos
      totalAssets: 1_020_000,
      totalLiabilities: 2_000, // ← coerción cruda (1:1) en vez de 1_020_000
      liquidity: 1_020_000,
      portfolioValue: 0,
      goals: [0],
      debts: [1_020_000], // Σdeudas convertido (lo que debería ser)
    };
    const found = evaluateGates(fxRaw, true);
    expect(found.some((x) => x.gate.startsWith("G3 pasivos") && x.severity === "P0")).toBe(true);
  });
});
