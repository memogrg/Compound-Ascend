/**
 * Motor de diagnóstico del perfil (funciones puras, sin IO).
 * Determinista: los números los calcula el motor; la IA solo redacta matices.
 * Usable en cliente y servidor.
 */
import type { ProfileDraft, ProfileDiagnosis, RiskClass } from "@/modules/personal-profile/types";
import { computeArchetype } from "@/modules/personal-profile/engine/archetype-engine";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";

const STAGE_LABEL: Record<string, string> = {
  ordenar: "ordenamiento y construcción de estabilidad",
  vivir_al_dia: "alivio de presión y estabilización",
  salir_deudas: "reducción de deuda",
  ahorrar_mejor: "optimización del ahorro",
  empezar_invertir: "inicio de inversión",
  hacer_crecer: "crecimiento patrimonial",
  proteger_familia: "protección familiar y patrimonial",
  libertad_financiera: "camino a la libertad financiera",
  prepararme_retiro: "preparación para el retiro",
  emprender: "creación de nuevas fuentes de ingreso",
};

/** Deriva la clase de riesgo a partir de reacción, preferencia y volatilidad. */
export function computeRiskClass(d: ProfileDraft): RiskClass {
  let score = 0; // -ve conservador, +ve agresivo

  switch (d.lossReaction) {
    case "vendo":
      score -= 2;
      break;
    case "espero":
      score -= 1;
      break;
    case "mantengo":
      score += 1;
      break;
    case "invierto_mas":
      score += 2;
      break;
  }

  if (d.riskPreference === "seguridad") score -= 2;
  if (d.riskPreference === "crecimiento") score += 2;

  if (typeof d.volatilityComfort === "number") {
    score += Math.round((d.volatilityComfort - 5) / 2.5);
  }
  if (d.investHorizon === "mas_5" || d.investHorizon === "5_10" || d.investHorizon === "mas_10") {
    score += 1;
  }

  if (score <= -3) return "conservador";
  if (score <= -1) return "moderado";
  if (score === 0) return "balanceado";
  if (score <= 2) return "crecimiento";
  return "agresivo";
}

/** Campos clave ponderados para el % de completitud del perfil. */
const COMPLETION_FIELDS: (keyof ProfileDraft)[] = [
  "displayName",
  "age",
  "country",
  "primaryCurrency",
  "financialNucleus",
  "lifeStage",
  "mainConcern",
  "goals",
  "priorities",
  "discipline",
  "knowledgeLevel",
  "lossReaction",
  "hasEmergencyFund",
  "coachingTone",
  "richLifePhrase",
];

export function computeCompletion(d: ProfileDraft): number {
  const total = COMPLETION_FIELDS.length;
  let filled = 0;
  for (const f of COMPLETION_FIELDS) {
    const v = d[f];
    if (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && v !== "") {
      filled += 1;
    }
  }
  return Math.round((filled / total) * 100);
}

function riskWord(r: RiskClass): string {
  return {
    conservador: "conservadora",
    moderado: "moderada",
    balanceado: "balanceada",
    crecimiento: "orientada al crecimiento",
    agresivo: "agresiva",
  }[r];
}

/** Construye el diagnóstico inicial al estilo de la Biblia. */
export function buildDiagnosis(d: ProfileDraft): ProfileDiagnosis {
  const riskClass = computeRiskClass(d);
  const stageSummary = STAGE_LABEL[d.lifeStage ?? "ordenar"] ?? "ordenamiento";
  const name = d.displayName?.trim() || "tu perfil";

  const priorityText =
    d.priorities && d.priorities.length > 0
      ? `Tu prioridad principal es ${d.priorities[0]!.toLowerCase()}`
      : "Tu prioridad es crear seguridad y reducir presión económica";

  const narrative =
    `Actualmente estás en una etapa de ${stageSummary}. ${priorityText}, ` +
    `mientras avanzas hacia tus objetivos. ${capitalize(name)} muestra una tolerancia al riesgo ${riskWord(riskClass)}. ` +
    `Te acompañaremos con recomendaciones claras, seguimiento mensual y alertas preventivas para tomar mejores decisiones.`;

  const suggestedPath = [
    "Construir tu Base Financiera para entender tu realidad de ingresos y gastos",
    "Crear o fortalecer tu fondo de emergencia",
    "Reducir riesgos financieros",
    "Priorizar tus metas",
    "Iniciar o fortalecer la inversión",
    "Proteger tu patrimonio",
    "Avanzar hacia la libertad financiera",
  ];

  // Arquetipo (Fase 3d): mismo cálculo puro que persiste completeProfile (inocuo
  // duplicarlo, es determinista). Se expone para la pantalla de cierre.
  const arche = computeArchetype(d);
  const play = ARCHETYPE_PLAYBOOKS[arche.primary];

  return {
    riskClass,
    stageSummary,
    narrative,
    suggestedPath,
    completion: computeCompletion(d),
    archetypePrimary: arche.primary,
    archetypeLabel: play.label,
    archetypeMeaning: play.userSummary,
    initialFocus: arche.initialFocus,
    dominantEmotion: arche.dominantEmotion,
    moneyScript: arche.moneyScript ?? undefined,
    ...(arche.secondary
      ? {
          archetypeSecondary: arche.secondary,
          archetypeLabel2: ARCHETYPE_PLAYBOOKS[arche.secondary].label,
        }
      : {}),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
