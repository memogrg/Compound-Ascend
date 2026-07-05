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

  it("distingue HERRAMIENTAS de cálculo vs ACCIONES y ofrece create_goal como acción proponible", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    // create_goal es una acción proponible (bloque action), no una herramienta.
    expect(prompt).toContain("create_goal");
    // La distinción explícita de los dos mecanismos.
    expect(prompt).toContain("HERRAMIENTAS de CÁLCULO");
    expect(prompt).toContain("ACCIONES que PROPONÉS");
    // No debe empujar el mensaje-bug de "herramienta no disponible" para metas.
    expect(prompt).toContain("crear metas SÍ está disponible");
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

  it("entorno macro: rinde los facts presentes y la regla de uso", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      inflacionYoYPct: 4.2,
      tbpPct: 3.75,
      tbpChange6mPp: -0.5,
      tpmPct: 4,
      tipoCambioVenta: 512.3,
      fedFundsPct: 4.5,
      treasury10yPct: 4.1,
      macroInsights: [
        { title: "Rendimiento real", body: "Tu portafolio supera la inflación.", tone: "pos" },
      ],
    });
    expect(prompt).toContain("Inflación interanual: 4.2%.");
    expect(prompt).toContain("TBP (Tasa Básica Pasiva, CR): 3.75% (variación 6m: -0.5 pp).");
    expect(prompt).toContain("TPM (Tasa de Política Monetaria, CR): 4%.");
    expect(prompt).toContain("Tipo de cambio USD/CRC (venta): 512.3.");
    expect(prompt).toContain("Fed Funds (EE. UU.): 4.5%.");
    expect(prompt).toContain("Tesoro 10A (EE. UU.): 4.1%.");
    expect(prompt).toContain(
      "Entorno (pos): Rendimiento real — Tu portafolio supera la inflación.",
    );
    // La regla de uso del entorno macro va siempre.
    expect(prompt).toContain("ENTORNO ECONÓMICO:");
    expect(prompt).toContain("rendimiento real");
  });

  it("ausencia de macro no rompe ni inyecta sus facts (la regla sí va)", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).not.toContain("Inflación interanual:");
    expect(prompt).not.toContain("TBP (Tasa Básica Pasiva");
    expect(prompt).not.toContain("Tipo de cambio USD/CRC");
    expect(prompt).not.toContain("Entorno (");
    // La instrucción de entorno es constante (no depende de los datos).
    expect(prompt).toContain("ENTORNO ECONÓMICO:");
  });
});

describe("buildSystemPrompt · identidad del asesor", () => {
  it("afirma la identidad canónica My Agent C+ / CARTERA+ (siempre, incluso ctx vacío)", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("Eres My Agent C+, el asesor financiero personal de la app CARTERA+.");
    expect(prompt).toContain("My Agent C+");
    expect(prompt).toContain("CARTERA+");
  });

  it("refuerza la identidad con una regla estricta que prohíbe nombres inventados", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    // La regla estricta existe y prohíbe explícitamente los alias inventados que el modelo usó.
    expect(prompt).toContain("IDENTIDAD (regla estricta)");
    expect(prompt).toContain("NUNCA");
    expect(prompt).toContain("Ascend AI");
    expect(prompt).toContain("Compound Ascend");
    expect(prompt).toContain("Aurora");
    // Y dice cómo responder ante "¿quién sos?".
    expect(prompt).toContain("respondé como My Agent C+ de CARTERA+");
  });

  it("la regla de identidad va temprano: antes del bloque de PERFIL DEL USUARIO", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    const idxIdentidad = prompt.indexOf("IDENTIDAD (regla estricta)");
    const idxPerfil = prompt.indexOf("PERFIL DEL USUARIO:");
    expect(idxIdentidad).toBeGreaterThanOrEqual(0);
    expect(idxIdentidad).toBeLessThan(idxPerfil);
  });
});

describe("buildSystemPrompt · reality-check con palancas y no-disculpas", () => {
  it("con topExpenseCategory: incluye la regla de reality-check y NOMBRA la categoría", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      incomeMonthly: 3_500_000,
      expenseMonthly: 2_100_000,
      freeCashflow: 1_400_000,
      topExpenseCategory: { name: "estilo vida", monthly: 900_000, pct: 43 },
      savingsRatePct: 40,
    });
    // La regla de reality-check con palancas.
    expect(prompt).toContain("REALITY-CHECK CON PALANCAS");
    expect(prompt).toContain("contra el flujo libre real del usuario");
    expect(prompt).toContain("palancas concretas");
    // Nombra la categoría de gasto más pesada (en el fact y dentro de la regla).
    expect(prompt).toContain("Gasto más pesado: estilo vida");
    expect(prompt).toContain("43% del gasto");
    expect(prompt).toContain("Tasa de ahorro: 40% del ingreso.");
    // El flujo libre real se cita dentro de la regla.
    expect(prompt).toContain("(1400000 CRC)");
  });

  it("incluye la regla de no-disculpas (lenguaje simple, sin perdón repetido)", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("No te disculpes de forma repetitiva");
    expect(prompt).toContain("lenguaje simple");
  });

  it("sin topExpenseCategory: la regla va igual, pero no nombra categoría ni rompe", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("REALITY-CHECK CON PALANCAS");
    expect(prompt).not.toContain("Gasto más pesado:");
    expect(prompt).not.toContain("Tasa de ahorro:");
  });
});

describe("buildSystemPrompt · trayectoria (memoria longitudinal)", () => {
  it("con trajectory poblada: rinde los facts de tendencia y la regla de uso con tacto", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      trajectory: {
        months: 4,
        savingsRate: { dir: "baja", deltaPp: -3 },
        expense: { dir: "sube", pct: 8 },
        netWorth: { dir: "sube", pct: 12 },
      },
    });
    // Facts de tendencia legibles.
    expect(prompt).toContain("Trayectoria (4 meses): tu tasa de ahorro viene bajando ~3 pp.");
    expect(prompt).toContain("Trayectoria: tu gasto mensual viene subiendo ~8%.");
    expect(prompt).toContain("Trayectoria: tu patrimonio neto viene subiendo ~12%.");
    // La regla de conducta (con tacto) va presente.
    expect(prompt).toContain("Tenés la trayectoria del usuario (cómo viene mes a mes)");
    expect(prompt).toContain("sin culpa");
  });

  it("dir 'estable' se rinde como 'se mantiene estable' (sin magnitud)", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      trajectory: { months: 5, savingsRate: { dir: "estable", deltaPp: 0.5 } },
    });
    expect(prompt).toContain("Trayectoria (5 meses): tu tasa de ahorro se mantiene estable.");
  });

  it("sin trajectory (usuario nuevo): no aparecen facts de tendencia ni la regla", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).not.toContain("Trayectoria");
    expect(prompt).not.toContain("Tenés la trayectoria del usuario");
  });
});
