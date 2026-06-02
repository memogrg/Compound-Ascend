import { describe, it, expect } from "vitest";
import {
  computeRiskClass,
  computeCompletion,
  buildDiagnosis,
} from "@/modules/personal-profile/engine/diagnosis";
import type { ProfileDraft } from "@/modules/personal-profile/types";

describe("motor de diagnóstico del perfil", () => {
  it("clasifica perfil conservador", () => {
    const d: ProfileDraft = {
      lossReaction: "vendo",
      riskPreference: "seguridad",
      volatilityComfort: 2,
    };
    expect(computeRiskClass(d)).toBe("conservador");
  });

  it("clasifica perfil agresivo", () => {
    const d: ProfileDraft = {
      lossReaction: "invierto_mas",
      riskPreference: "crecimiento",
      volatilityComfort: 10,
      investHorizon: "mas_5",
    };
    expect(computeRiskClass(d)).toBe("agresivo");
  });

  it("perfil vacío tiene 0% de completitud", () => {
    expect(computeCompletion({})).toBe(0);
  });

  it("aumenta la completitud al llenar campos", () => {
    const partial: ProfileDraft = {
      displayName: "Memo",
      age: 32,
      country: "Costa Rica",
      primaryCurrency: "CRC",
      lifeStage: "ordenar",
    };
    const c = computeCompletion(partial);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(100);
  });

  it("genera narrativa y ruta sugerida", () => {
    const d: ProfileDraft = {
      displayName: "Memo",
      lifeStage: "ordenar",
      priorities: ["seguridad"],
      riskPreference: "equilibrio",
    };
    const diag = buildDiagnosis(d);
    expect(diag.narrative).toContain("etapa");
    expect(diag.suggestedPath.length).toBeGreaterThan(3);
    expect(diag.riskClass).toBeDefined();
  });
});
