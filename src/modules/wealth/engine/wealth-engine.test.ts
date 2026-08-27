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

// Las brechas de las 5 esenciales (excluye la sugerencia opcional de gastos_menores).
// Paso 2 (88b225a) sumó invalidez como 5ª esencial (policyType "incapacidad"); cada una pesa 20.
const ESSENTIAL_GAPS = new Set([
  "Seguro de gastos mayores",
  "Seguro de vida",
  "Seguro de invalidez",
  "Fondo de emergencia",
  "Fondo de paz",
]);
const essentialGaps = (gaps: { type: string }[]) => gaps.filter((g) => ESSENTIAL_GAPS.has(g.type));

describe("computeProtection — 4 esenciales + 1 opcional", () => {
  it("sin nada => score bajo y las 5 brechas esenciales", () => {
    const d = computeProtection(baseCtx, []);
    expect(d.score).toBe(0);
    expect(essentialGaps(d.gaps)).toHaveLength(5);
  });

  it("gastos_mayores + vida + emergencia + paz (falta invalidez) => score 80 y la invalidez como brecha", () => {
    // 4 de 5 esenciales cubiertas; invalidez (policyType 'incapacidad') queda descubierta => 80.
    const ctx: WealthContext = { ...baseCtx, hasEmergencyFund: true, hasPeaceFund: true };
    const d = computeProtection(ctx, [policy("gastos_mayores"), policy("vida")]);
    expect(d.score).toBe(80);
    const essential = essentialGaps(d.gaps);
    expect(essential).toHaveLength(1);
    expect(essential[0]?.type).toBe("Seguro de invalidez");
  });

  it("las 5 esenciales cubiertas => score 100; la opcional gastos_menores no lo afecta", () => {
    // Todas las esenciales cubiertas (incl. invalidez/incapacidad) => 100. La sugerencia opcional
    // de gastos_menores aparece pero NO baja el score: es el chequeo de "opcional no puntúa".
    const ctx: WealthContext = { ...baseCtx, hasEmergencyFund: true, hasPeaceFund: true };
    const d = computeProtection(ctx, [
      policy("gastos_mayores"),
      policy("vida"),
      policy("incapacidad"),
    ]);
    expect(d.score).toBe(100);
    expect(essentialGaps(d.gaps)).toHaveLength(0);
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
