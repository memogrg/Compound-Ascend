import { describe, it, expect } from "vitest";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import type { ProfileDraft } from "@/modules/personal-profile/types";

describe("buildDiagnosis · arquetipo en la pantalla de cierre", () => {
  it("draft de constructor expone arquetipo, etiqueta y significado", () => {
    const d: ProfileDraft = { lifeStage: "hacer_crecer", riskPreference: "crecimiento" };
    const dx = buildDiagnosis(d);
    expect(dx.archetypePrimary).toBe("constructor");
    expect(dx.archetypeLabel).toBe("Constructor de Futuro");
    expect(dx.archetypeMeaning && dx.archetypeMeaning.length).toBeGreaterThan(0);
    expect(dx.initialFocus && dx.initialFocus.length).toBeGreaterThan(0);
    // No rompe lo existente.
    expect(dx.riskClass).toBeDefined();
    expect(dx.suggestedPath.length).toBeGreaterThan(0);
  });

  it("draft vacío → organizador, sin secundario, no rompe", () => {
    const dx = buildDiagnosis({});
    expect(dx.archetypePrimary).toBe("organizador");
    expect(dx.archetypeLabel).toBe("Organizador en Construcción");
    expect(dx.archetypeLabel2).toBeUndefined();
    expect(dx.completion).toBeGreaterThanOrEqual(0);
  });
});
