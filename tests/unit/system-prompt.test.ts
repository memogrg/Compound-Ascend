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

  it("dominantValue produce su hecho en el Bloque A; sin él no rompe", () => {
    const conValor = buildSystemPrompt({ currency: "CRC", dominantValue: "seguridad para mi familia" });
    expect(conValor).toContain("Lo que más quiere de su dinero: seguridad para mi familia.");

    const sinValor = buildSystemPrompt({ currency: "CRC" });
    expect(sinValor).toContain("PERFIL DEL USUARIO:");
    expect(sinValor).not.toContain("Lo que más quiere de su dinero:");
  });

  it("personalización: explainStyle y exposición producen sus reglas; sin ellos no rompe", () => {
    const conPerso = buildSystemPrompt({
      currency: "CRC",
      explainStyle: "muy_simple",
      monthsCoverage: "menos 1 mes",
      futureImage: "familia protegida",
      desiredFeelings: ["claridad", "tranquilidad"],
    });
    expect(conPerso).toContain("Explicación: explica paso a paso, sin jerga.");
    expect(conPerso).toContain("Muy expuesto ante una pérdida de ingreso");
    expect(conPerso).toContain("Imagen de su futuro: familia protegida.");
    expect(conPerso).toContain("Quiere sentir al usar la app: claridad, tranquilidad.");

    const sinPerso = buildSystemPrompt({ currency: "CRC" });
    expect(sinPerso).toContain("COMO HABLARLE A ESTE USUARIO:");
    expect(sinPerso).not.toContain("Explicación:");
    expect(sinPerso).not.toContain("Muy expuesto ante una pérdida de ingreso");
  });

  it("sin arquetipo no rompe ni inyecta reglas de arquetipo", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("COMO HABLARLE A ESTE USUARIO:");
    expect(prompt).not.toContain("Foco inicial sugerido:");
    expect(prompt).not.toContain("Arquetipo:");
  });

  it("insights producen la sección de observaciones (A) y la regla de conducta (B); sin ellos no rompe", () => {
    const conInsights = buildSystemPrompt({
      currency: "CRC",
      insights: [
        { severity: "celebrar", title: "¡Estás muy cerca de \"Viaje\"!", body: "Un último empujón." },
      ],
    });
    // Bloque A: sección + el insight como hecho.
    expect(conInsights).toContain("Observaciones recientes de su comportamiento:");
    expect(conInsights).toContain("Observación reciente (celebrar): ¡Estás muy cerca de \"Viaje\"! — Un último empujón.");
    // Bloque B: la regla de uso con tacto.
    expect(conInsights).toContain("Menciónalas SOLO si vienen al caso");

    const sinInsights = buildSystemPrompt({ currency: "CRC" });
    expect(sinInsights).toContain("PERFIL DEL USUARIO:");
    expect(sinInsights).not.toContain("Observaciones recientes de su comportamiento:");
    expect(sinInsights).not.toContain("Menciónalas SOLO si vienen al caso");
  });

  it("con métricas patrimoniales: rinde los facts y las reglas de uso directo", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      netWorth: 253650941,
      expenseMonthly: 2575128,
      indicePatrimonial: 39,
      nivelPatrimonial: "Estabilidad inicial",
      numeroDeLibertad: 772538304,
      añosDeLibertad: 6,
      mesesDeLibertad: 34,
      coberturaPasivaPct: 35,
      calidadPatrimonio: 0,
      investableWealth: 199244964,
      patrimonioDiagnosis: ["deuda_mala_alta"],
    });
    // (i) Los facts patrimoniales aparecen.
    expect(prompt).toContain("Índice Patrimonial: 39/100 (nivel: Estabilidad inicial).");
    expect(prompt).toContain("Número de Libertad Financiera: 772538304 CRC");
    expect(prompt).toContain("Años de Libertad: tu patrimonio invertible cubre 6 años");
    // (ii) Las nuevas instrucciones de uso de métricas y estilo directo.
    expect(prompt).toContain("Usa SIEMPRE las métricas que ya vienen en tu contexto");
    expect(prompt).toContain("NUNCA las recalcules a partir del patrimonio neto y los gastos");
    expect(prompt).toContain("usa los Años de Libertad");
    expect(prompt).toContain("Responde primero la respuesta concreta en 1-2 frases");
    expect(prompt).toContain("haz UNA sola pregunta corta y espera la respuesta");
  });

  it("las reglas de estilo y uso de métricas se incluyen siempre (incluso ctx vacío)", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("USA TUS MÉTRICAS YA CALCULADAS:");
    expect(prompt).toContain("ESTILO DE RESPUESTA");
    expect(prompt).toContain("Responde primero la respuesta concreta en 1-2 frases");
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
