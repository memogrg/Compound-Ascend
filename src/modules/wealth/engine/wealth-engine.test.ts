import { describe, it, expect } from "vitest";
import { computeProtection } from "@/modules/wealth/engine/wealth-engine";
import type { InsurancePolicy, WealthContext } from "@/modules/wealth/types";

const baseCtx: WealthContext = {
  freeCashflow: 0,
  hasEmergencyFund: false,
  hasPeaceFund: false,
  hasCriticalDebt: false,
  dependents: 0,
  riskClassKnown: false,
  currency: "CRC",
};

function policy(policyType: string): InsurancePolicy {
  return {
    id: policyType,
    policyType: policyType as InsurancePolicy["policyType"],
    provider: null,
    coverage: null,
    premium: null,
    premiumFrequency: null,
    renewalDate: null,
    currency: "CRC",
  };
}

// Las brechas de las 4 esenciales (excluye la sugerencia opcional de gastos_menores).
const ESSENTIAL_GAPS = new Set([
  "Seguro de gastos mayores",
  "Seguro de vida",
  "Fondo de emergencia",
  "Fondo de paz",
]);
const essentialGaps = (gaps: { type: string }[]) => gaps.filter((g) => ESSENTIAL_GAPS.has(g.type));

describe("computeProtection — 4 esenciales + 1 opcional", () => {
  it("sin nada => score bajo y las 4 brechas esenciales", () => {
    const d = computeProtection(baseCtx, []);
    expect(d.score).toBe(0);
    expect(essentialGaps(d.gaps)).toHaveLength(4);
  });

  it("gastos_mayores + vida + emergencia + paz => score 100 y sin brechas esenciales", () => {
    const ctx: WealthContext = { ...baseCtx, hasEmergencyFund: true, hasPeaceFund: true };
    const d = computeProtection(ctx, [policy("gastos_mayores"), policy("vida")]);
    expect(d.score).toBe(100);
    expect(essentialGaps(d.gaps)).toHaveLength(0);
  });

  it("sin gastos_menores => aparece la sugerencia opcional pero el score sigue 100", () => {
    const ctx: WealthContext = { ...baseCtx, hasEmergencyFund: true, hasPeaceFund: true };
    const d = computeProtection(ctx, [policy("gastos_mayores"), policy("vida")]);
    expect(d.score).toBe(100);
    const optional = d.gaps.find((g) => g.type === "Gastos médicos menores (opcional)");
    expect(optional).toBeDefined();
    expect(optional?.severity).toBe("bajo");
  });

  it("gastos_menores no aporta al score: cubrirlo no sube de por debajo de 100", () => {
    // Solo la opcional cubierta, ninguna esencial => sigue 0.
    const d = computeProtection(baseCtx, [policy("gastos_menores")]);
    expect(d.score).toBe(0);
    expect(d.gaps.find((g) => g.type === "Gastos médicos menores (opcional)")).toBeUndefined();
  });
});
