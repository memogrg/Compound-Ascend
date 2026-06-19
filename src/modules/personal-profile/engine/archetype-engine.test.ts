import { describe, it, expect } from "vitest";
import { computeArchetype } from "@/modules/personal-profile/engine/archetype-engine";
import type { ProfileDraft } from "@/modules/personal-profile/types";

describe("computeArchetype", () => {
  it("salir_deudas + preocupación deudas → liberador", () => {
    const d: ProfileDraft = { lifeStage: "salir_deudas", mainConcerns: ["deudas"] };
    expect(computeArchetype(d).primary).toBe("liberador");
  });

  it("núcleo familia + dependientes → guardian", () => {
    const d: ProfileDraft = { financialNucleus: "familia", dependentsCount: 2 };
    expect(computeArchetype(d).primary).toBe("guardian");
  });

  it("hacer_crecer + preferencia crecimiento → constructor", () => {
    const d: ProfileDraft = { lifeStage: "hacer_crecer", riskPreference: "crecimiento" };
    const r = computeArchetype(d);
    expect(r.primary).toBe("constructor");
    expect(r.dominantEmotion).toBe("motivacion");
  });

  it("revisa nunca + control bajo → clarificador y emoción evasion", () => {
    const d: ProfileDraft = { reviewHabit: "nunca", perceivedControl: 2 };
    const r = computeArchetype(d);
    expect(r.primary).toBe("clarificador");
    expect(r.dominantEmotion).toBe("evasion");
  });

  it("draft vacío → organizador, sin secundario, scores en 0", () => {
    const r = computeArchetype({});
    expect(r.primary).toBe("organizador");
    expect(r.secondary).toBeNull();
    expect(Object.values(r.scores).every((s) => s === 0)).toBe(true);
    // El tono/foco salen del playbook del primario.
    expect(r.recommendedTone).toBe("simple y paciente");
    expect(r.initialFocus.length).toBeGreaterThan(0);
  });

  it("moneyScriptPhrase construya_futuro → script 'crecimiento' y empuja constructor", () => {
    const r = computeArchetype({ moneyScriptPhrase: "construya_futuro" });
    expect(r.moneyScript).toBe("crecimiento");
    expect(r.primary).toBe("constructor");
  });

  it("moneyScriptPhrase merezco_disfrutar → script 'estatus' y empuja disfrutador", () => {
    const r = computeArchetype({ moneyScriptPhrase: "merezco_disfrutar" });
    expect(r.moneyScript).toBe("estatus");
    expect(r.primary).toBe("disfrutador");
  });

  it("stressSpending gusto → dominantEmotion 'culpa'", () => {
    expect(computeArchetype({ stressSpending: "gusto" }).dominantEmotion).toBe("culpa");
  });

  it("socialComparison presiona → dominantEmotion 'frustracion'", () => {
    expect(computeArchetype({ socialComparison: "presiona" }).dominantEmotion).toBe("frustracion");
  });

  it("sin frase de money script → moneyScript null", () => {
    expect(computeArchetype({}).moneyScript).toBeNull();
  });

  it("secundario solo si está a ≤2 pts del primario y > 0", () => {
    // proteger_familia: guardian+3, protector+1 → guardian 3, protector 1 (dif 2) → secundario protector.
    const r = computeArchetype({ lifeStage: "proteger_familia" });
    expect(r.primary).toBe("guardian");
    expect(r.secondary).toBe("protector");
  });
});
