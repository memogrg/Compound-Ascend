import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ProfileDashboard } from "@/modules/personal-profile/components/profile-dashboard";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import type { ProfileDraft } from "@/modules/personal-profile/types";

/**
 * Regresión "deploy antes de migrar": tras #461 los 15 campos de ranking son `string[]` y las
 * escalas son 1-5, PERO los datos ya guardados siguen con la forma vieja hasta que corra la
 * migración 20260729000001. La página NO debe romper con esos datos: la presentación y el
 * motor coercen con asRanked/primaryOf. Este test es el guard de eso.
 */
const legacyDraft = {
  displayName: "Memo",
  age: 32,
  country: "Costa Rica",
  primaryCurrency: "CRC",
  financialNucleus: "solo",
  // Campos que ANTES eran respuesta única → string suelto (aún no migrado a array).
  lifeStage: "salir_deudas",
  mainConcern: "deudas",
  dineroPrimero: "tranquilidad",
  lossReaction: "vendo",
  conectaFrase: "dormir_tranquilo",
  singleProblem: "salir_deuda",
  incomeReaction: "guardo",
  richLifePhrase: "libertad",
  futureImage: "viajes",
  // Arrays que ya existían.
  goals: ["casa"],
  priorities: ["seguridad"],
  hardest: ["ahorrar"],
  // Escalas en el rango VIEJO 1-10.
  perceivedControl: 8,
  discipline: 9,
  impulsivity: 7,
  volatilityComfort: 6,
  knowledgeLevel: "intermedio",
  hasEmergencyFund: "no",
} as unknown as ProfileDraft;

describe("ProfileDashboard · backward-compat con datos pre-migración", () => {
  it("buildDiagnosis no lanza con campos single (string) y escalas 1-10", () => {
    expect(() => buildDiagnosis(legacyDraft)).not.toThrow();
  });

  it("renderiza el dashboard con un draft de forma vieja SIN throw", () => {
    const diagnosis = buildDiagnosis(legacyDraft);
    let html = "";
    expect(() => {
      html = renderToStaticMarkup(
        createElement(ProfileDashboard, { draft: legacyDraft, diagnosis }),
      );
    }).not.toThrow();
    // La etapa se resuelve por su VALOR completo (primaryOf), no por el primer carácter:
    // "salir_deudas" → su label real, no "s" (lo que daría el bug de `"salir_deudas"[0]`).
    expect(html).toContain("Tengo deudas y quiero salir de ellas");
  });
});
