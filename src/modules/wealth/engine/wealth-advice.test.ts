import { describe, it, expect } from "vitest";
import { buildWealthAdvice } from "@/modules/wealth/engine/wealth-advice";

const base = { archetypeLabel: "Constructor de Patrimonio", dominantValue: "libertad" };

describe("buildWealthAdvice", () => {
  it("sin perfil (sin archetypeLabel) → null", () => {
    expect(buildWealthAdvice({ value: 1000, holdingsCount: 2 })).toBeNull();
  });

  it("no invierte aún + sin fondo → warn 'base'", () => {
    const a = buildWealthAdvice({ ...base, value: 0, holdingsCount: 0, hasEmergencyFund: "no" });
    expect(a?.accent).toBe("warn");
    expect(a?.title).toContain("Primero tu base");
  });

  it("no invierte aún + con fondo → pos 'dar el paso'", () => {
    const a = buildWealthAdvice({ ...base, value: 0, holdingsCount: 0, hasEmergencyFund: "si" });
    expect(a?.accent).toBe("pos");
    expect(a?.title).toContain("dar el paso");
    expect(a?.body).toContain("libertad");
  });

  it("cartera concentrada (topPct 0.8) → warn 'concentrada'", () => {
    const a = buildWealthAdvice({
      ...base,
      value: 10000,
      holdingsCount: 3,
      topLabel: "Cripto",
      topPct: 0.8,
    });
    expect(a?.accent).toBe("warn");
    expect(a?.title).toContain("concentrada");
    expect(a?.body).toContain("Cripto");
    expect(a?.body).toContain("80%");
  });

  it("crecimiento + sin fondo (con holdings, no concentrada) → warn 'crece con base'", () => {
    const a = buildWealthAdvice({
      ...base,
      riskClass: "crecimiento",
      hasEmergencyFund: "no_se",
      value: 10000,
      holdingsCount: 4,
      topPct: 0.4,
    });
    expect(a?.accent).toBe("warn");
    expect(a?.title).toBe("Crece con base");
  });

  it("sano y diversificado → pos 'buen camino'", () => {
    const a = buildWealthAdvice({
      ...base,
      riskClass: "moderado",
      hasEmergencyFund: "si",
      value: 10000,
      holdingsCount: 5,
      topPct: 0.4,
    });
    expect(a?.accent).toBe("pos");
    expect(a?.title).toContain("buen camino");
    // Cierre por arquetipo constructor.
    expect(a?.body).toContain("escenarios a 5/10/20 años");
  });
});
