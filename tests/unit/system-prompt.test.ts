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

  it("tono/concisión: distingue cambio de divisa de rotar inversiones, ahorros≠inversiones, fuera de tema y no alarmar", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    // Mover plata de una MONEDA a otra = cambio de divisa, NO rotar inversiones (nada de monólogo Nasdaq).
    expect(prompt).toMatch(/CAMBIO DE DIVISA/i);
    expect(prompt).toMatch(/rotar capital aplica SOLO/i);
    // Ahorros ≠ inversiones.
    expect(prompt).toMatch(/AHORROS ≠ INVERSIONES/i);
    // Concisión dura + no alarmar/upsell.
    expect(prompt).toMatch(/CONCISI[ÓO]N DURA/i);
    expect(prompt).toMatch(/no estás quebrado/i); // lo cita como ejemplo de lo que NO hacer
    // Fuera de tema: respuesta breve, no monólogo financiero.
    expect(prompt).toMatch(/No llevo la hora/i);
    // Los 3 "no sé con dato".
    expect(prompt).toMatch(/Me pasé del presupuesto/i);
    expect(prompt).toMatch(/alcanza para qué/i);
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

  it("wealthBreakdown se vuelca como fact legible (invertido/líquido/otros + clases) y activa la regla", () => {
    const ctx: FinancialContext = {
      currency: "CRC",
      wealthBreakdown: {
        invested: 4_200_000,
        liquid: 3_000_000,
        other: 47_000_000,
        topClasses: [
          { label: "Productivos", value: 38_000_000 },
          { label: "Uso personal", value: 9_000_000 },
          { label: "Inversión", value: 4_200_000 },
        ],
      },
    };
    const prompt = buildSystemPrompt(ctx);
    // El fact con los tres montos y las clases principales.
    expect(prompt).toContain(
      "Distribución de tu patrimonio: invertido 4200000 CRC, en ahorros/líquido 3000000 CRC, otros 47000000 CRC; principales clases: Productivos 38000000 CRC, Uso personal 9000000 CRC, Inversión 4200000 CRC.",
    );
    // La regla que le dice al modelo que use el desglose y no diga que no lo tiene.
    expect(prompt).toContain("Distribución de tu patrimonio");
    expect(prompt).toContain("NO digas que no tenés el desglose");
  });

  it("sin wealthBreakdown no aparece el fact de distribución", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).not.toContain("Distribución de tu patrimonio: invertido");
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
    // Sin estado real de fondos → cae al auto-reporte del onboarding.
    expect(byUrgency).toContain("Fondo de emergencia (auto-reporte del onboarding): no.");

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
      numeroDeSeguridad: 300000000,
      numeroDeIndependencia: 772538304,
      añosDeLibertad: 6,
      mesesDeColchon: 34,
      coberturaPasivaPct: 35,
      calidadPatrimonio: 0,
      investableWealth: 199244964,
      patrimonioDiagnosis: ["deuda_mala_alta"],
    });
    // (i) Los facts patrimoniales aparecen — los TRES números, distintos.
    expect(prompt).toContain("Índice Patrimonial: 39/100 (nivel: Estabilidad inicial).");
    expect(prompt).toContain("Número de Seguridad: 300000000 CRC");
    expect(prompt).toContain("Número de Independencia: 772538304 CRC");
    // Sin numeroDeLibertad → invita a definirlo, no inventa la cifra.
    expect(prompt).toContain("Número de Libertad: el usuario AÚN NO definió su estilo de vida deseado");
    expect(prompt).toContain("Años de Libertad: tu patrimonio invertible cubre 6 años");
    // (ii) Las nuevas instrucciones de uso de métricas y estilo directo.
    expect(prompt).toContain("Usa SIEMPRE las métricas que ya vienen en tu contexto");
    expect(prompt).toContain("NUNCA las recalcules a partir del patrimonio neto y los gastos");
    expect(prompt).toContain("usa los Años de colchón");
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
    expect(prompt).toContain("Lo que más le cuesta (por prioridad): primaria: ahorrar · secundaria: invertir.");
    expect(prompt).toContain("Sus prioridades (por prioridad): primaria: seguridad · secundaria: familia.");
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

describe("buildSystemPrompt · comportamientos de asesor experto (reglas condicionales)", () => {
  it("emergencyMonths<3 → regla de proteger antes de crecer (no si el respaldo es suficiente)", () => {
    const bajo = buildSystemPrompt({ currency: "CRC", emergencyMonths: 1 });
    expect(bajo).toContain("Su respaldo de emergencia es bajo (menos de 3 meses)");
    expect(bajo).toContain("reforzar la base");
    const ok = buildSystemPrompt({ currency: "CRC", emergencyMonths: 8 });
    expect(ok).not.toContain("Su respaldo de emergencia es bajo");
  });

  it("cerca del Número de Libertad (invertible ≥80%) → regla de riesgo de secuencia", () => {
    const cerca = buildSystemPrompt({
      currency: "CRC",
      numeroDeIndependencia: 200_000_000,
      investableWealth: 190_000_000,
    });
    expect(cerca).toContain("RIESGO DE SECUENCIA");
    expect(cerca).toContain("cubetas");
    // Lejos del número → no aplica.
    const lejos = buildSystemPrompt({
      currency: "CRC",
      numeroDeIndependencia: 200_000_000,
      investableWealth: 13_000_000,
    });
    expect(lejos).not.toContain("RIESGO DE SECUENCIA");
  });

  it("regla de seguros (vida/invalidez) presente y condicionada a que pregunte", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("SEGUROS (aplicá solo si el usuario pregunta por seguros)");
    expect(prompt).toContain("INVALIDEZ/incapacidad");
    expect(prompt).toContain("sin dependientes, no es necesario");
  });

  it("incomeSourceCount=1 rinde el fact de una sola fuente", () => {
    const prompt = buildSystemPrompt({ currency: "CRC", incomeSourceCount: 1 });
    expect(prompt).toContain("Fuentes de ingreso activas: 1 (una sola fuente).");
  });
});

describe("buildSystemPrompt · hogar compartido (E4)", () => {
  it("householdShared=true → el prompt marca las finanzas como de la cuenta común", () => {
    const prompt = buildSystemPrompt({ currency: "CRC", name: "Dra", householdShared: true });
    expect(prompt).toContain("HOGAR COMPARTIDO");
    expect(prompt).toContain("Dra");
    // La instrucción clave: no atribuir un movimiento a quien pregunta sin saberlo.
    expect(prompt).toContain("el gasto del hogar");
  });

  it("sin householdShared → NO menciona hogar compartido (usuario individual intacto)", () => {
    const prompt = buildSystemPrompt({ currency: "CRC", name: "Dra" });
    expect(prompt).not.toContain("HOGAR COMPARTIDO");
  });

  it("householdShared sin nombre → cae a 'un miembro del hogar', no rompe", () => {
    const prompt = buildSystemPrompt({ currency: "CRC", householdShared: true });
    expect(prompt).toContain("HOGAR COMPARTIDO");
    expect(prompt).toContain("un miembro del hogar");
  });
});

describe("buildSystemPrompt · política de sobrante + tono conciso", () => {
  it("incluye la regla dura del SOBRANTE (no es gasto libre; nunca ocio) y el tono tipo Claude", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toContain("SOBRANTE DEL PRESUPUESTO");
    expect(prompt).toContain("NO es dinero libre");
    expect(prompt).toMatch(/pagar deudas|fondo de emergencia|libertad financiera/);
    expect(prompt).toMatch(/NUNCA sugieras gastar el sobrante en restaurantes\/ocio/i);
    // Si quiere un gusto → evaluar su SOBRE discrecional, no el sobrante global.
    expect(prompt).toMatch(/SOBRE discrecional/i);
    // Tono directo/conciso tipo Claude.
    expect(prompt).toMatch(/tipo Claude/i);
    expect(prompt).toMatch(/una o dos frases/i);
  });
});

describe("buildSystemPrompt · inversiones por posición + conversación", () => {
  const withHoldings = {
    currency: "CRC" as const,
    investmentInvested: [{ monto: 1000, moneda: "USD" }],
    investmentValue: [{ monto: 1240, moneda: "USD" }],
    investmentPL: [{ monto: 240, moneda: "USD" }],
    holdings: [
      {
        symbol: "KMNO",
        name: "Kimbal Minero",
        assetType: "cripto",
        quantity: 100,
        invested: 1000,
        value: 1120,
        price: 11,
        pl: 120,
        plPct: 0.12,
        currency: "CRC", // registrada en colones…
        monedaFila: "USD", // …pero cotiza (y se reporta) en dólares
        valorPrimario: 560000,
        priceUnavailable: false,
      },
    ],
  };

  it("inyecta las posiciones con costo de compra, valor, precio y P/L (cifras reales)", () => {
    const prompt = buildSystemPrompt(withHoldings);
    expect(prompt).toContain("KMNO");
    expect(prompt).toContain("invertido 1000");
    expect(prompt).toContain("vale 1120");
    expect(prompt).toContain("11"); // precio actual
    expect(prompt).toContain("+120"); // P/L
    // Totales de inversión, con su moneda.
    expect(prompt).toContain("valor actual 1240 USD");
  });

  it("la posición se etiqueta con la moneda en que COTIZA, no con la de visualización", () => {
    const prompt = buildSystemPrompt(withHoldings);
    expect(prompt).toContain("[USD]"); // la fila va en dólares…
    expect(prompt).toContain("Moneda de VISUALIZACIÓN (la que el usuario ve en la app): CRC");
    // …y la vieja regla de "todo viene en una sola moneda" ya no existe.
    expect(prompt).not.toContain("TODOS los montos");
    expect(prompt).toMatch(/Cada monto de tu contexto viene con SU moneda/);
    expect(prompt).toMatch(/NO inventes un total/);
  });

  it("portafolio MIXTO: subtotales por moneda, y el total convertido marcado como conversión", () => {
    const prompt = buildSystemPrompt({
      ...withHoldings,
      portfolioValue: [
        { monto: 45_000_000, moneda: "CRC" },
        { monto: 1240, moneda: "USD" },
      ],
      portfolioValueConvertido: { monto: 45_620_000, moneda: "CRC" },
    });
    // Las dos monedas aparecen, cada una con su código; no hay una suma cruzada.
    expect(prompt).toContain("45000000 CRC");
    expect(prompt).toContain("1240 USD");
    expect(prompt).toMatch(/45620000 CRC convertido/);
  });

  it("sin tipo de cambio no hay total único: lo dice en vez de inventarlo", () => {
    const prompt = buildSystemPrompt({
      ...withHoldings,
      portfolioValue: [
        { monto: 45_000_000, moneda: "CRC" },
        { monto: 1240, moneda: "USD" },
      ],
    });
    expect(prompt).toMatch(/No hay tipo de cambio disponible/i);
    expect(prompt).not.toMatch(/convertido\)/);
  });

  it("regla: usa las cifras reales para «si vendo X» y NUNCA inventa el ATH", () => {
    const prompt = buildSystemPrompt(withHoldings);
    expect(prompt).toMatch(/si vendo/i);
    expect(prompt).toMatch(/NUNCA las inventes/i);
    expect(prompt).toMatch(/máximo hist[oó]rico|ATH/i);
    expect(prompt).toMatch(/no tengo acceso/i); // instrucción de NO decir esto si el dato está
  });

  it("precio no disponible → lo dice, no supone valor", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      holdings: [
        { symbol: "XYZ", name: "XYZ", assetType: "cripto", quantity: 3, invested: 1000, value: 1000, price: null, pl: 0, plPct: 0, currency: "USD", monedaFila: "USD", valorPrimario: 500_000, priceUnavailable: true },
      ],
    });
    expect(prompt).toContain("precio actual no disponible");
  });

  it("regla de conversación: responder la ÚLTIMA consulta, turnos previos solo contexto", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toMatch(/ÚLTIMA consulta/i);
    expect(prompt).toMatch(/SOLO contexto|solo contexto/i);
  });
});

describe("buildSystemPrompt · persona de asesor de inversión experto con barandas", () => {
  it("actúa como asesor experto que usa herramientas para datos reales, con las barandas", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toMatch(/ASESOR DE INVERSIÓN EXPERTO/i);
    expect(prompt).toMatch(/datos reales|precio, ATH/i);
    expect(prompt).toMatch(/nunca los inventes/i);
    // Barandas.
    expect(prompt).toMatch(/RANGO\/ESCENARIO|riesgo visible/i);
    expect(prompt).toMatch(/no asesoría financiera formal|INFORMACIÓN/i);
    expect(prompt).toMatch(/ALTA VOLATILIDAD/i);
    expect(prompt).toMatch(/no se puede cronometrar|el máximo es PASADO/i);
  });

  it("conoce las 3 referencias fuertes y la estrategia de ROTAR capital, con barandas", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toMatch(/S&P 500/);
    expect(prompt).toMatch(/Nasdaq/i);
    expect(prompt).toMatch(/\bBTC\b/);
    expect(prompt).toMatch(/ROTAR capital|mover\/rotar capital/i);
    // Con barandas: riesgo visible, sin promesas, defensa/fondo antes de arriesgar.
    expect(prompt).toMatch(/riesgo visible/i);
    expect(prompt).toMatch(/fondo de emergencia\/paz|prioridad al fondo/i);
    expect(prompt).toMatch(/no ordenás|la decisión es del usuario/i);
  });

  it("tono cálido y proactivo en el mejor interés del usuario (inversión y defensa)", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toMatch(/cálido/i);
    expect(prompt).toMatch(/proactiv/i);
    expect(prompt).toMatch(/mejor interés/i);
  });
});

describe("buildSystemPrompt · fondos de defensa (estado REAL supersede el auto-reporte)", () => {
  const df = (over?: Partial<NonNullable<FinancialContext["defenseFunds"]>>): FinancialContext =>
    ({
      currency: "CRC",
      defenseFunds: {
        currency: "CRC",
        activeFund: "peace",
        emergency: { registrado: true, actual: 800_000, objetivo: 1_000_000, progresoPct: 80, aporteRecomendado: 50_000, cubierto: false },
        paz: { registrado: false, actual: 0, objetivo: 3_000_000, progresoPct: 0, aporteRecomendado: 0, cubierto: false },
        ...over,
      },
    }) as FinancialContext;

  it("fondo REGISTRADO → reporta acumulado/objetivo/progreso y prohíbe decir 'no lo tenés'", () => {
    const prompt = buildSystemPrompt(df());
    expect(prompt).toMatch(/Fondo de emergencia: REGISTRADO — 800000 de 1000000/);
    expect(prompt).toMatch(/80%/);
    expect(prompt).toMatch(/faltan 200000.*aporte sugerido 50000/i); // brecha + aporte
    expect(prompt).toMatch(/NUNCA digas que el usuario "no tiene"/i);
  });

  it("fondo NO registrado → dice que falta (no lo inventa como existente)", () => {
    const prompt = buildSystemPrompt(df());
    expect(prompt).toMatch(/Fondo de paz: NO registrado/);
  });

  it("con estado real presente NO emite la línea de auto-reporte del onboarding", () => {
    const prompt = buildSystemPrompt({ ...df(), hasEmergencyFund: "no" } as FinancialContext);
    expect(prompt).not.toMatch(/auto-reporte del onboarding/i);
    // Y aún así reporta el fondo REGISTRADO (el real manda sobre el "no" viejo).
    expect(prompt).toMatch(/Fondo de emergencia: REGISTRADO/);
  });

  it("sin estado real → cae al auto-reporte del onboarding", () => {
    const prompt = buildSystemPrompt({ currency: "CRC", hasEmergencyFund: "no" } as FinancialContext);
    expect(prompt).toMatch(/auto-reporte del onboarding/i);
  });
});

describe("buildSystemPrompt · compromiso mensual (base de la Independencia)", () => {
  it("con compromisoMensual → lo reporta con desglose y prohíbe pedir 'registrar el gasto'", () => {
    const prompt = buildSystemPrompt({
      currency: "CRC",
      numeroDeIndependencia: 450_000,
      compromisoMensual: 3_000,
      compromisoDesglose: { sobres: 1_500, metas: 800, dca: 400, deudas: 200, seguros: 100 },
    });
    expect(prompt).toMatch(/Compromiso mensual TOTAL/i);
    expect(prompt).toMatch(/sobres 1500/); // desglose
    expect(prompt).toMatch(/DCA 400/);
    expect(prompt).toMatch(/NO le pidas.*registrar su gasto|NO.*registrar/i);
  });

  it("sin compromisoMensual → no aparece la línea (no inventa)", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).not.toMatch(/Compromiso mensual TOTAL/i);
  });
});

describe("buildSystemPrompt · encuadre/disclaimer UNA vez (firstTurn)", () => {
  it("primer turno → invita a dar el encuadre una vez", () => {
    const prompt = buildSystemPrompt({ currency: "CRC", firstTurn: true });
    expect(prompt).toMatch(/ENCUADRE \(una sola vez/i);
    expect(prompt).toMatch(/información, no asesoría/i);
  });

  it("turno posterior → NO repetir el encuadre; solo 'es un escenario, no un plan' breve", () => {
    const prompt = buildSystemPrompt({ currency: "CRC", firstTurn: false });
    expect(prompt).toMatch(/ENCUADRE \(ya dado\)/i);
    expect(prompt).toMatch(/NO los repitas/i);
    expect(prompt).toMatch(/es un escenario, no un plan/i);
  });

  it("acota el historial: instruye responder SOLO la última consulta, sin recalcular lo previo", () => {
    const prompt = buildSystemPrompt({ currency: "CRC" });
    expect(prompt).toMatch(/SOLO la ÚLTIMA consulta/i);
    expect(prompt).toMatch(/NO los recalcules/i);
  });
});
