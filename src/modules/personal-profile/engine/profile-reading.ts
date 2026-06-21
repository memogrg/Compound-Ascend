/**
 * Lectura conductual del cierre del onboarding (pura, determinista, testeable).
 * Traduce el borrador del perfil en una lectura en SEGUNDA PERSONA: interpretación,
 * scorecard numérico, fortalezas y oportunidades en positivo, cómo acompañará la IA
 * y la ruta con su porqué. Sin IA (los matices llegan en A2). Sin IO.
 */
import type { Archetype, ProfileDraft, ProfileReading, ScoreItem } from "@/modules/personal-profile/types";
import { computeArchetype } from "@/modules/personal-profile/engine/archetype-engine";
import { computeRiskClass } from "@/modules/personal-profile/engine/diagnosis";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";
import {
  RISK_DISPLAY,
  RISK_READING,
  KNOWLEDGE_LEVELS,
  PRIORITIES,
  GOALS,
} from "@/modules/personal-profile/constants";

const labelOf = (options: { value: string; label: string }[], value?: string): string | undefined =>
  value ? options.find((o) => o.value === value)?.label : undefined;

const URGENCY_LABEL: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  critica: "Crítica",
};

/** Nivel cualitativo de una escala 1-10 (más = mejor). */
const level = (n: number): string =>
  n >= 8 ? "muy alto" : n >= 6 ? "alto" : n >= 4 ? "medio" : "a fortalecer";

/** Igual pero invertido (menos = mejor), p. ej. impulsividad. */
const levelInverted = (n: number): string =>
  n <= 3 ? "muy baja, a tu favor" : n <= 5 ? "media" : n <= 7 ? "alta, conviene cuidarla" : "muy alta, a vigilar";

/** Prioridades de acompañamiento por arquetipo (de qué hablar primero). */
const COMPANION_PRIORITIES: Record<Archetype, string[]> = {
  organizador: ["orden de gastos", "presupuesto base", "automatización"],
  navegante: ["flujo de caja", "gastos esenciales", "fondo mínimo"],
  liberador: ["estrategia de deuda", "orden de pagos", "evitar nueva deuda"],
  disfrutador: ["presupuesto de disfrute", "límites amables", "alertas suaves"],
  clarificador: ["claridad gradual", "microacciones", "clasificación asistida"],
  protector: ["fondo de emergencia", "seguros", "crecimiento gradual"],
  estratega: ["patrimonio neto", "ratios y tasa de ahorro", "escenarios"],
  creador: ["metas aspiracionales", "patrimonio primero", "estilo de vida sostenible"],
  guardian: ["protección familiar", "seguros", "metas compartidas"],
  constructor: ["tasa de inversión", "patrimonio", "aportes recurrentes", "retiro"],
};

/** Ruta sugerida con el porqué de cada paso (alineada con buildDiagnosis). */
const ROUTE: { step: string; why: string }[] = [
  { step: "Construir tu Base Financiera", why: "Para conocer tu capacidad real de inversión y gasto." },
  { step: "Crear o fortalecer tu fondo de emergencia", why: "Para sostener tu estrategia sin fragilidad." },
  { step: "Reducir riesgos financieros", why: "Para que un imprevisto no descarrile tu plan." },
  { step: "Priorizar tus metas", why: "Para enfocar tu dinero en lo que más te importa." },
  { step: "Iniciar o fortalecer la inversión", why: "Para que tu dinero crezca con el tiempo." },
  { step: "Proteger tu patrimonio", why: "Para cuidar lo que vas construyendo." },
  { step: "Avanzar hacia la libertad financiera", why: "Para ganar opciones y tranquilidad a largo plazo." },
];

export function buildProfileReading(d: ProfileDraft): ProfileReading {
  const arche = computeArchetype(d);
  const play = ARCHETYPE_PLAYBOOKS[arche.primary];
  const riskClass = computeRiskClass(d);
  const riskDisplay = RISK_DISPLAY[riskClass];
  const riskReading = RISK_READING[riskClass];

  // Interpretación en 2ª persona (sin nombre en 3ª persona).
  let interpretation = `Tu arquetipo principal es ${play.label}. ${play.userSummary}`;
  if (arche.secondary) {
    interpretation += ` También muestras rasgos de ${ARCHETYPE_PLAYBOOKS[arche.secondary].label}.`;
  }

  // Scorecard: solo los que existan.
  const scorecard: ScoreItem[] = [];
  if (typeof d.perceivedControl === "number")
    scorecard.push({
      label: "Control percibido",
      value: `${d.perceivedControl}/10`,
      reading: `Nivel ${level(d.perceivedControl)}.`,
    });
  if (typeof d.discipline === "number")
    scorecard.push({
      label: "Disciplina",
      value: `${d.discipline}/10`,
      reading: `Nivel ${level(d.discipline)}.`,
    });
  if (typeof d.impulsivity === "number")
    scorecard.push({
      label: "Impulsividad",
      value: `${d.impulsivity}/10`,
      reading: `Impulsividad ${levelInverted(d.impulsivity)}.`,
    });
  const knowledge = labelOf(KNOWLEDGE_LEVELS, d.knowledgeLevel);
  if (knowledge)
    scorecard.push({
      label: "Conocimiento",
      value: knowledge,
      reading: KNOWLEDGE_LEVELS.find((o) => o.value === d.knowledgeLevel)?.desc ?? "",
    });
  if (d.urgency && URGENCY_LABEL[d.urgency])
    scorecard.push({
      label: "Urgencia",
      value: URGENCY_LABEL[d.urgency]!,
      reading:
        d.urgency === "alta" || d.urgency === "critica"
          ? "Prioriza estabilidad antes de tomar riesgos."
          : "Tienes margen para construir con calma.",
    });
  scorecard.push({ label: "Perfil de riesgo", value: riskDisplay, reading: riskReading });
  const topPriority = labelOf(PRIORITIES, d.priorities?.[0]);
  if (topPriority)
    scorecard.push({ label: "Prioridad principal", value: topPriority, reading: "Tu eje al decidir." });
  const topGoal = labelOf(GOALS, d.goals?.[0]);
  if (topGoal)
    scorecard.push({ label: "Meta", value: topGoal, reading: "Tu primer objetivo concreto." });

  // Fortalezas (condicionales, máx 5; fallback si ninguna).
  const strengths: string[] = [];
  if (typeof d.discipline === "number" && d.discipline >= 7)
    strengths.push("Puedes sostener un plan en el tiempo.");
  if (typeof d.impulsivity === "number" && d.impulsivity <= 3)
    strengths.push("Tu baja impulsividad te da una base sólida.");
  if (typeof d.perceivedControl === "number" && d.perceivedControl >= 7)
    strengths.push("Sientes el control de tus finanzas.");
  if (d.knowledgeLevel === "avanzado" || d.knowledgeLevel === "experto")
    strengths.push("Manejas los conceptos financieros con soltura.");
  if (d.richLifePhrase || d.futureImage || d.dineroPrimero)
    strengths.push("Tienes claridad de hacia dónde quieres ir.");
  if (d.reviewHabit === "semanal" || d.reviewHabit === "diario")
    strengths.push("Revisas tus finanzas con constancia.");
  if (strengths.length === 0) strengths.push("Diste el paso de conocerte financieramente.");

  // Oportunidades (en positivo, máx 5; siempre el ancla del arquetipo primero).
  const opportunities: string[] = [`Tu siguiente nivel: ${play.initialFocus}.`];
  const noFund = d.hasEmergencyFund === "no" || d.hasEmergencyFund === "no_se";
  if (noFund) opportunities.push("Fortalecer tu base de seguridad (fondo de emergencia).");
  if ((riskClass === "crecimiento" || riskClass === "agresivo") && noFund)
    opportunities.push("Balancear tu crecimiento con una base de protección.");
  if (typeof d.impulsivity === "number" && d.impulsivity >= 7)
    opportunities.push("Diseñar reglas simples para tus compras de impulso.");
  if (typeof d.discipline === "number" && d.discipline <= 4)
    opportunities.push("Convertir la intención en hábitos pequeños y sostenibles.");

  // Acompañamiento.
  const advanced = d.knowledgeLevel === "avanzado" || d.knowledgeLevel === "experto";
  const companionship = {
    tone: play.recommendedTone,
    priorities: COMPANION_PRIORITIES[arche.primary],
    avoids: [
      "regaños",
      "comparaciones con otros",
      "promesas de rendimiento",
      advanced ? "explicaciones demasiado básicas" : "tecnicismos innecesarios",
    ],
  };

  return {
    interpretation,
    riskDisplay,
    riskReading,
    scorecard,
    strengths: strengths.slice(0, 5),
    opportunities: opportunities.slice(0, 5),
    companionship,
    route: ROUTE,
  };
}
