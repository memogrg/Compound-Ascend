import { describe, it, expect } from "vitest";
import { buildSystemPrompt, type FinancialContext } from "@/lib/ai/system-prompt";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";

const PERSONA_HINT = "asesor financiero conductual, no un chatbot";

describe("buildSystemPrompt · perfil conductual", () => {
  it("ctx vacío no rompe: incluye persona base y los dos bloques", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("PERFIL DEL USUARIO:");
    expect(prompt).toContain("COMO HABLARLE A ESTE USUARIO:");
    // La persona base se embebe SIEMPRE, aunque no haya perfil.
    expect(prompt).toContain(PERSONA_HINT);
    // El bloque de acciones se mantiene intacto.
    expect(prompt).toContain("create_transaction");
  });

  it("coachingTone='suave' y knowledgeLevel='basico' producen sus reglas de conducta", () => {
    const ctx: FinancialContext = {
      currency: "CRC",
      coachingTone: "suave",
      knowledgeLevel: "basico",
    };
    const prompt = buildSystemPrompt(ctx);
    expect(prompt).toContain("COMO HABLARLE A ESTE USUARIO:");
    expect(prompt).toContain("cálido y motivador");
    expect(prompt).toContain("analogías cotidianas y cero jerga");
    // Persona base presente y el campo de perfil volcado como hecho.
    expect(prompt).toContain(PERSONA_HINT);
    expect(prompt).toContain("Tono de coaching preferido: suave.");
  });

  it("impulsividad alta, urgencia alta y dependientes activan sus reglas", () => {
    const prompt = buildSystemPrompt({
      currency: "USD",
      impulsivity: 8,
      urgency: "alta",
      dependentsCount: 2,
    });
    expect(prompt).toContain("anticipa el impulso antes de las compras");
    expect(prompt).toContain("prioriza primero la estabilidad");
    expect(prompt).toContain("prioriza la protección");
  });

  it("sin fondo de emergencia + bajo presión activa la regla de seguridad (§18)", () => {
    // hasEmergencyFund 'no' + urgency alta → debe disparar.
    const byUrgency = buildSystemPrompt({ currency: "CRC", hasEmergencyFund: "no", urgency: "alta" });
    expect(byUrgency).toContain("construir el fondo de emergencia antes que cualquier inversión de riesgo");
    expect(byUrgency).toContain("Fondo de emergencia: no.");

    // hasEmergencyFund 'no_se' + lifeStage de deuda → también dispara (sin urgencia).
    const byStage = buildSystemPrompt({ currency: "CRC", hasEmergencyFund: "no_se", lifeStage: "salir deudas" });
    expect(byStage).toContain("construir el fondo de emergencia antes que cualquier inversión de riesgo");

    // Con fondo de emergencia ('si') NO debe disparar la regla aunque haya urgencia.
    const withFund = buildSystemPrompt({ currency: "CRC", hasEmergencyFund: "si", urgency: "critica" });
    expect(withFund).not.toContain("construir el fondo de emergencia antes que cualquier inversión de riesgo");
  });

  it("arquetipo en el ctx produce su etiqueta (Bloque A) y su guía + foco (Bloque B)", () => {
    const pb = ARCHETYPE_PLAYBOOKS.liberador;
    const prompt = buildSystemPrompt({
      currency: "CRC",
      archetypePrimary: "liberador",
      archetypeLabel: pb.label,
      archetypeGuidance: pb.guidance,
      initialFocus: pb.initialFocus,
      recommendedTone: pb.recommendedTone,
      dominantEmotion: "presion",
    });
    // Bloque A: etiqueta y emoción.
    expect(prompt).toContain(`Arquetipo: ${pb.label}.`);
    expect(prompt).toContain("Emoción dominante: presion.");
    // Bloque B: guía, foco y tono recomendado.
    expect(prompt).toContain(`Arquetipo ${pb.label}: ${pb.guidance}`);
    expect(prompt).toContain(`Foco inicial sugerido: ${pb.initialFocus}.`);
    expect(prompt).toContain(`Tono recomendado por su arquetipo: ${pb.recommendedTone}`);
  });

  it("moneyScript='evitacion' produce su regla y se vuelca como creencia; sin él no rompe", () => {
    const conScript = buildSystemPrompt({ currency: "CRC", moneyScript: "evitacion" });
    expect(conScript).toContain("Creencia dominante sobre el dinero: evitacion.");
    expect(conScript).toContain("Tiende a evitar el tema: usa cero juicio");

    const sinScript = buildSystemPrompt({ currency: "CRC" });
    expect(sinScript).toContain("COMO HABLARLE A ESTE USUARIO:");
    expect(sinScript).not.toContain("Creencia dominante sobre el dinero:");
  });

  it("sin arquetipo no rompe ni inyecta reglas de arquetipo", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("COMO HABLARLE A ESTE USUARIO:");
    expect(prompt).not.toContain("Foco inicial sugerido:");
    expect(prompt).not.toContain("Arquetipo:");
  });

  it("vuelca el perfil de riesgo y los campos de Rich Life como hechos", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      riskClass: "moderado",
      hardest: ["ahorrar", "invertir"],
      priorities: ["seguridad", "familia"],
      richLifePhrase: "Tiempo con mi familia",
    });
    expect(prompt).toContain("Perfil de riesgo: moderado.");
    expect(prompt).toContain("Lo que más le cuesta: ahorrar, invertir.");
    expect(prompt).toContain("Sus prioridades: seguridad, familia.");
    expect(prompt).toContain('Su vida rica en una frase: "Tiempo con mi familia".');
  });
});
