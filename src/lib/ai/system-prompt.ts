/**
 * System prompt de Ascend AI (puro, sin "server-only": testeable).
 * Recibe el FinancialContext que arma el context-engine (Fase 5) y produce
 * el prompt en español con el contexto AUTORIZADO + la spec de acciones
 * propuestas (la IA propone, nunca ejecuta sola).
 */

export type FinancialContext = {
  name?: string;
  currency: string;
  incomeMonthly?: number;
  expenseMonthly?: number;
  freeCashflow?: number;
  netWorth?: number;
  topConcern?: string;
  portfolioValue?: number;
  portfolioReturnPct?: number;
  topAssetClass?: string;
  // Fase 5 · context engine: perfil, deudas, metas y vinculables.
  lifeStage?: string;
  debtCount?: number;
  debtTotal?: number;
  topDebtName?: string;
  topDebtApr?: number;
  goalCount?: number;
  goalsProgressPct?: number;
  // Perfil conductual (Fase · asesor conductual). Todos opcionales y best-effort:
  // si el wizard no se completó, simplemente no aparecen.
  riskClass?: string;
  lossReaction?: string;
  riskPreference?: string;
  horizon?: string;
  volatilityComfort?: number;
  hasInvested?: boolean;
  discipline?: number;
  impulsivity?: number;
  reviewHabit?: string;
  hardest?: string[];
  knowledgeLevel?: string;
  topicsToLearn?: string[];
  coachingTone?: string;
  coachingFrequency?: string;
  alertIntensity?: string;
  priorities?: string[];
  richLifePhrase?: string;
  richLifeVision?: string;
  urgency?: string;
  perceivedControl?: number;
  dependentsCount?: number;
  financialNucleus?: string;
  /** 'si' | 'no' | 'construyendo' | 'no_se' (del borrador del wizard). */
  hasEmergencyFund?: string;
  // Arquetipo conductual (Fase 2). Best-effort: si el perfil no se completó, no aparecen.
  archetypePrimary?: string;
  archetypeSecondary?: string;
  dominantEmotion?: string;
  recommendedTone?: string;
  initialFocus?: string;
  archetypeLabel?: string;
  archetypeLabel2?: string;
  archetypeGuidance?: string;
  /** Money script (Fase 3a): evitacion|vigilancia|estatus|seguridad|crecimiento|suficiencia. */
  moneyScript?: string;
  /** Lo que el usuario más quiere de su dinero (Paso 5 · narrativa de valor). */
  dominantValue?: string;
  // Personalización (Fase 3c).
  explainStyle?: string;
  monthsCoverage?: string;
  protectionPerceived?: string;
  decisionComfort?: string;
  interventionStyle?: string;
  futureImage?: string;
  desiredFeelings?: string[];
  /** Entidades a las que una transacción propuesta puede vincularse. */
  linkables?: {
    debt: { id: string; name: string }[];
    goal: { id: string; name: string }[];
  };
  /** Observaciones conductuales recientes (memoria conductual, Fase 4). */
  insights?: { severity: string; title: string; body: string }[];
  /** Guía conductual recuperada de la Biblia para esta conversación (Fase 5c). */
  knowledge?: string[];
};

export function buildSystemPrompt(ctx: FinancialContext): string {
  const facts: string[] = [`Moneda principal: ${ctx.currency}.`];
  if (ctx.name) facts.push(`El usuario se llama ${ctx.name}.`);
  if (ctx.incomeMonthly !== undefined)
    facts.push(`Ingreso mensual: ${ctx.incomeMonthly} ${ctx.currency}.`);
  if (ctx.expenseMonthly !== undefined)
    facts.push(`Gasto mensual: ${ctx.expenseMonthly} ${ctx.currency}.`);
  if (ctx.freeCashflow !== undefined)
    facts.push(`Flujo libre: ${ctx.freeCashflow} ${ctx.currency}.`);
  if (ctx.netWorth !== undefined) facts.push(`Patrimonio neto: ${ctx.netWorth} ${ctx.currency}.`);
  if (ctx.topConcern) facts.push(`Principal preocupación: ${ctx.topConcern}.`);
  if (ctx.portfolioValue !== undefined)
    facts.push(`Valor de mercado del portafolio: ${ctx.portfolioValue} ${ctx.currency}.`);
  if (ctx.portfolioReturnPct !== undefined)
    facts.push(`Rendimiento del portafolio: ${(ctx.portfolioReturnPct * 100).toFixed(1)}%.`);
  if (ctx.topAssetClass) facts.push(`Clase de activo principal: ${ctx.topAssetClass}.`);
  if (ctx.lifeStage) facts.push(`Etapa de vida: ${ctx.lifeStage}.`);
  if (ctx.debtCount !== undefined && ctx.debtTotal !== undefined) {
    facts.push(
      `Deudas activas: ${ctx.debtCount} por un total de ${ctx.debtTotal} ${ctx.currency}.`,
    );
  }
  if (ctx.topDebtName) {
    facts.push(
      `Deuda más cara: ${ctx.topDebtName}${ctx.topDebtApr !== undefined ? ` (APR ${ctx.topDebtApr}%)` : ""}.`,
    );
  }
  if (ctx.goalCount !== undefined) {
    facts.push(
      `Metas de ahorro: ${ctx.goalCount}${ctx.goalsProgressPct !== undefined ? ` (avance ${(ctx.goalsProgressPct * 100).toFixed(0)}%)` : ""}.`,
    );
  }

  // Perfil conductual (omitir los indefinidos, mismo patrón de facts).
  if (ctx.riskClass) facts.push(`Perfil de riesgo: ${ctx.riskClass}.`);
  if (ctx.riskPreference) facts.push(`Preferencia de inversión: ${ctx.riskPreference}.`);
  if (ctx.lossReaction) facts.push(`Reacción ante pérdidas: ${ctx.lossReaction}.`);
  if (ctx.horizon) facts.push(`Horizonte de inversión: ${ctx.horizon}.`);
  if (ctx.volatilityComfort !== undefined)
    facts.push(`Comodidad con la volatilidad: ${ctx.volatilityComfort}/10.`);
  if (ctx.hasInvested !== undefined)
    facts.push(`¿Ha invertido antes?: ${ctx.hasInvested ? "sí" : "no"}.`);
  if (ctx.discipline !== undefined) facts.push(`Disciplina financiera: ${ctx.discipline}/10.`);
  if (ctx.impulsivity !== undefined) facts.push(`Impulsividad: ${ctx.impulsivity}/10.`);
  if (ctx.reviewHabit) facts.push(`Hábito de revisión: ${ctx.reviewHabit}.`);
  if (ctx.hardest?.length) facts.push(`Lo que más le cuesta: ${ctx.hardest.join(", ")}.`);
  if (ctx.knowledgeLevel) facts.push(`Nivel de conocimiento financiero: ${ctx.knowledgeLevel}.`);
  if (ctx.topicsToLearn?.length) facts.push(`Quiere aprender sobre: ${ctx.topicsToLearn.join(", ")}.`);
  if (ctx.priorities?.length) facts.push(`Sus prioridades: ${ctx.priorities.join(", ")}.`);
  if (ctx.coachingTone) facts.push(`Tono de coaching preferido: ${ctx.coachingTone}.`);
  if (ctx.coachingFrequency) facts.push(`Frecuencia de coaching: ${ctx.coachingFrequency}.`);
  if (ctx.alertIntensity) facts.push(`Intensidad de alertas preferida: ${ctx.alertIntensity}.`);
  if (ctx.urgency) facts.push(`Urgencia financiera percibida: ${ctx.urgency}.`);
  if (ctx.perceivedControl !== undefined)
    facts.push(`Control percibido sobre sus finanzas: ${ctx.perceivedControl}/10.`);
  if (ctx.dependentsCount !== undefined) facts.push(`Personas que dependen de él/ella: ${ctx.dependentsCount}.`);
  if (ctx.financialNucleus) facts.push(`Núcleo financiero: ${ctx.financialNucleus}.`);
  if (ctx.hasEmergencyFund) facts.push(`Fondo de emergencia: ${ctx.hasEmergencyFund.replaceAll("_", " ")}.`);
  if (ctx.richLifePhrase) facts.push(`Su vida rica en una frase: "${ctx.richLifePhrase}".`);
  if (ctx.richLifeVision) facts.push(`Su visión de vida rica: "${ctx.richLifeVision}".`);
  if (ctx.archetypeLabel) {
    facts.push(
      `Arquetipo: ${ctx.archetypeLabel}${ctx.archetypeLabel2 ? ` (secundario: ${ctx.archetypeLabel2})` : ""}.`,
    );
  }
  if (ctx.dominantEmotion) facts.push(`Emoción dominante: ${ctx.dominantEmotion}.`);
  if (ctx.moneyScript) facts.push(`Creencia dominante sobre el dinero: ${ctx.moneyScript}.`);
  if (ctx.dominantValue) facts.push(`Lo que más quiere de su dinero: ${ctx.dominantValue}.`);
  if (ctx.monthsCoverage) facts.push(`Cobertura si pierde su ingreso: ${ctx.monthsCoverage}.`);
  if (ctx.protectionPerceived) facts.push(`Protección percibida: ${ctx.protectionPerceived}.`);
  if (ctx.decisionComfort) facts.push(`Comodidad al decidir: ${ctx.decisionComfort}.`);
  if (ctx.futureImage) facts.push(`Imagen de su futuro: ${ctx.futureImage}.`);
  if (ctx.desiredFeelings?.length)
    facts.push(`Quiere sentir al usar la app: ${ctx.desiredFeelings.join(", ")}.`);

  // Memoria conductual (Fase 4): observaciones recientes detectadas.
  if (ctx.insights?.length) {
    facts.push("Observaciones recientes de su comportamiento:");
    for (const i of ctx.insights) {
      facts.push(`Observación reciente (${i.severity}): ${i.title} — ${i.body}`);
    }
  }

  // Vinculables: la IA puede proponer la transacción ya conectada a su entidad.
  const linkFacts: string[] = [];
  if (ctx.linkables?.debt.length) {
    linkFacts.push(
      `Deudas vinculables (linkedKind "debt"): ${ctx.linkables.debt.map((d) => `${d.name} [${d.id}]`).join("; ")}.`,
    );
  }
  if (ctx.linkables?.goal.length) {
    linkFacts.push(
      `Metas vinculables (linkedKind "goal"): ${ctx.linkables.goal.map((g) => `${g.name} [${g.id}]`).join("; ")}.`,
    );
  }

  // ── Bloque B: reglas de conducta derivadas del perfil ──
  // La persona base (de la Biblia) se embebe SIEMPRE; las reglas condicionales se
  // añaden según el perfil disponible. Si no hay perfil, queda solo la persona base.
  const PERSONA =
    "Eres un asesor financiero conductual, no un chatbot. Guía, no juez. Usa la " +
    "fórmula: validación breve + dato relevante + recomendación concreta + beneficio " +
    "emocional + opción de control. Nunca regañes, no uses vergüenza, no compares con " +
    "otros usuarios, no prometas rendimientos, no des instrumentos específicos sin " +
    "idoneidad. Toda recomendación incluye por qué, próximo paso y posible riesgo.";

  const behaviorRules: string[] = [];

  // Arquetipo primero: marca el tono y el foco de toda la conversación.
  if (ctx.archetypeLabel) {
    if (ctx.archetypeGuidance) behaviorRules.push(`Arquetipo ${ctx.archetypeLabel}: ${ctx.archetypeGuidance}`);
    if (ctx.initialFocus) behaviorRules.push(`Foco inicial sugerido: ${ctx.initialFocus}.`);
    if (ctx.recommendedTone)
      behaviorRules.push(
        `Tono recomendado por su arquetipo: ${ctx.recommendedTone}. Si choca con el tono que pidió el usuario, prioriza su preferencia pero modula con criterio.`,
      );
  }

  // Money script: una regla de tono según la creencia dominante (Fase 3a).
  const moneyScriptRule: Record<string, string> = {
    evitacion: "Tiende a evitar el tema: usa cero juicio, microacciones y claridad gradual.",
    vigilancia: "Tiende al sobrecontrol: dale permiso y equilibrio, no más alarmas.",
    estatus: "Asocia dinero con estatus: redirige a metas propias, sin moralizar.",
    seguridad: "Necesita seguridad primero: refuerza base antes que crecimiento.",
    crecimiento: "Orientado a crecer: habla de escenarios y largo plazo, con control de riesgo.",
    suficiencia: "Valora suficiencia: celebra lo que ya construyó y el progreso propio.",
  };
  if (ctx.moneyScript && moneyScriptRule[ctx.moneyScript])
    behaviorRules.push(moneyScriptRule[ctx.moneyScript]!);

  // Personalización (Fase 3c): cómo explicar e intervenir, y exposición ante pérdida.
  const explainRule: Record<string, string> = {
    muy_simple: "Explicación: explica paso a paso, sin jerga.",
    ejemplos: "Explicación: usa ejemplos/analogías cotidianas.",
    numeros: "Explicación: apóyate en cifras y escenarios.",
    tecnico: "Explicación: puedes ser técnico y preciso.",
    directo: "Explicación: ve directo al punto.",
    resumen_detalle: "Explicación: da primero un resumen y ofrece profundizar.",
  };
  if (ctx.explainStyle && explainRule[ctx.explainStyle]) behaviorRules.push(explainRule[ctx.explainStyle]!);

  const interventionRule: Record<string, string> = {
    recordatorio: "Si se desvía de una meta: un recordatorio amable.",
    impacto_futuro: "Si se desvía de una meta: muéstrale el impacto futuro.",
    alerta_antes: "Si se desvía de una meta: avísale antes de gastar.",
    alternativa: "Si se desvía de una meta: ofrece una alternativa más barata.",
    reto: "Si se desvía de una meta: propón un reto pequeño.",
    directo: "Si se desvía de una meta: un mensaje directo.",
    porque: "Si se desvía de una meta: recuérdale su porqué.",
  };
  if (ctx.interventionStyle && interventionRule[ctx.interventionStyle])
    behaviorRules.push(interventionRule[ctx.interventionStyle]!);

  if (ctx.monthsCoverage === "menos 1 mes" || ctx.monthsCoverage === "1 2 meses")
    behaviorRules.push(
      "Muy expuesto ante una pérdida de ingreso: prioriza liquidez y fondo de emergencia antes que riesgo.",
    );

  const tone: Record<string, string> = {
    directo: "Tono: franco y sin rodeos, ve al punto.",
    suave: "Tono: cálido y motivador, refuerza lo positivo.",
    tecnico: "Tono: aporta datos y precisión, no simplifiques de más.",
    simple: "Tono: explica paso a paso, sin jerga.",
    coach: "Tono: retador pero de apoyo; empújalo a comprometerse con un paso.",
  };
  if (ctx.coachingTone && tone[ctx.coachingTone]) behaviorRules.push(tone[ctx.coachingTone]!);
  if (ctx.knowledgeLevel === "basico")
    behaviorRules.push("Nivel básico: usa analogías cotidianas y cero jerga técnica.");
  if (ctx.knowledgeLevel === "experto")
    behaviorRules.push("Nivel experto: ve directo a tasas, escenarios y números, sin rodeos didácticos.");
  if (ctx.alertIntensity === "suaves")
    behaviorRules.push("Alertas: sin alarmismo; plantea los riesgos con calma.");
  if (ctx.alertIntensity === "directas")
    behaviorRules.push("Alertas: sé claro y contundente al señalar riesgos.");
  if (ctx.impulsivity !== undefined && ctx.impulsivity >= 7)
    behaviorRules.push("Impulsividad alta: anticipa el impulso antes de las compras; ofrece una pausa o una regla simple antes de gastar.");
  if (ctx.urgency === "alta" || ctx.urgency === "critica")
    behaviorRules.push("Urgencia financiera alta: prioriza primero la estabilidad (liquidez), no inversión de riesgo.");
  // Regla de seguridad (Biblia §18): sin fondo de emergencia (o sin saberlo) y bajo
  // presión (urgencia alta/crítica o etapa de vida de presión/deuda) → estabilizar antes.
  const noEmergencyFund = ctx.hasEmergencyFund === "no" || ctx.hasEmergencyFund === "no_se";
  const underPressure =
    ctx.urgency === "alta" ||
    ctx.urgency === "critica" ||
    (!!ctx.lifeStage && /deuda|presi|al d[ií]a/i.test(ctx.lifeStage));
  if (noEmergencyFund && underPressure)
    behaviorRules.push("Sin fondo de emergencia y bajo presión: prioriza estabilidad y construir el fondo de emergencia antes que cualquier inversión de riesgo; no propongas estrategias agresivas.");
  if (ctx.dependentsCount !== undefined && ctx.dependentsCount > 0)
    behaviorRules.push("Tiene dependientes: prioriza la protección (seguro, fondo de emergencia) antes que estrategias agresivas.");

  // Memoria conductual (Fase 4): cómo usar las observaciones recientes.
  if (ctx.insights?.length)
    behaviorRules.push(
      "Tienes observaciones recientes de su comportamiento. Menciónalas SOLO si vienen al caso, con tacto y sin juicio; conéctalas con su meta o Rich Life; celebra las positivas; respeta su intensidad de alertas y su arquetipo. No las enumeres mecánicamente.",
    );

  return [
    "Eres Ascend AI, el asesor financiero personal de la app Compound Ascend.",
    "Responde SIEMPRE en español, con tono humano, claro y sin culpa. Explica el porqué de cada recomendación.",
    "No prometas rendimientos garantizados. No des consejos de inversión específicos como certezas; habla de escenarios, riesgos y horizonte.",
    "Usa solo el contexto financiero proporcionado; no inventes datos del usuario.",
    "",
    "PERFIL DEL USUARIO:",
    ...facts.map((f) => `- ${f}`),
    ...(linkFacts.length
      ? [
          "",
          "Entidades del usuario (para vincular transacciones):",
          ...linkFacts.map((f) => `- ${f}`),
        ]
      : []),
    "",
    "COMO HABLARLE A ESTE USUARIO:",
    `- ${PERSONA}`,
    ...behaviorRules.map((r) => `- ${r}`),
    ...(ctx.knowledge?.length
      ? [
          "",
          "Guía conductual aplicable a esta conversación (base de conocimiento):",
          ...ctx.knowledge.map((k) => `- ${k}`),
        ]
      : []),
    "",
    "Si el usuario claramente quiere registrar una transacción, crear una meta, o aplicar una estrategia, PROPÓN una acción añadiendo al final un bloque:",
    "```action",
    '{"type":"create_transaction","payload":{"kind":"gasto","description":"...","amount":0,"currency":"' +
      ctx.currency +
      '","category":null,"linkedKind":null,"linkedId":null,"linkedName":null},"summary":"texto corto"}',
    "```",
    "Tipos válidos: create_transaction, create_goal, suggest_debt_strategy, suggest_budget_adjustment.",
    'Si la transacción es claramente un pago de deuda o un aporte/retiro de meta y existe la entidad en las listas de arriba, incluye "linkedKind" ("debt" o "goal"), "linkedId" (el id entre corchetes) y "linkedName" (el nombre legible). Si hay duda sobre cuál entidad, deja los tres en null.',
    "NUNCA afirmes que ya ejecutaste la acción: solo la propones; el usuario debe confirmar.",
  ].join("\n");
}
