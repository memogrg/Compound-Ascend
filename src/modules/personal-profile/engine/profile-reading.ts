/**
 * Lectura conductual del cierre del onboarding (pura, determinista, testeable).
 * Traduce el borrador del perfil en una lectura en SEGUNDA PERSONA: interpretación,
 * scorecard numérico, fortalezas y oportunidades en positivo, cómo acompañará la IA
 * y la ruta con su porqué. Sin IA (los matices llegan en A2). Sin IO.
 */
import type {
  Archetype,
  MoneyScript,
  ProfileDraft,
  ProfileReading,
  ScoreItem,
} from "@/modules/personal-profile/types";
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

/** Lectura espejo (Cierre v3): titular en 2ª persona por arquetipo. */
const HERO_BY_ARCHETYPE: Record<Archetype, string> = {
  constructor: "Estás construyendo libertad y patrimonio.",
  liberador: "Estás recuperando tu libertad financiera.",
  navegante: "Estás recuperando el control y el aire.",
  organizador: "Estás poniendo orden para despegar.",
  clarificador: "Estás ganando claridad sobre tu dinero.",
  protector: "Estás construyendo una base que te deja dormir tranquilo.",
  estratega: "Estás afinando tu sistema financiero.",
  creador: "Estás diseñando una vida mejor, con cabeza.",
  guardian: "Estás protegiendo lo que más te importa.",
  disfrutador: "Estás aprendiendo a disfrutar sin sabotear tu futuro.",
};

/** Lectura del money script (creencia dominante sobre el dinero), si la hay. */
const MONEY_SCRIPT_READING: Record<MoneyScript, string> = {
  crecimiento: "Para ti, el dinero es una herramienta para crecer y construir futuro.",
  seguridad: "Para ti, el dinero representa seguridad y tranquilidad.",
  estatus: "Para ti, el dinero está ligado a disfrutar lo que has logrado.",
  vigilancia: "Para ti, el dinero pide control: te sientes mejor cuando todo está claro.",
  evitacion:
    "Tu relación con el dinero ha sido más de evitarlo que de mirarlo de frente — y eso se puede transformar.",
  suficiencia: "Para ti, el dinero es para estar realmente bien, no para aparentar.",
};

/** Fragmento de la "próxima jugada" por arquetipo (se hila en el copy). */
const NEXT_MOVE_PHRASE: Record<Archetype, string> = {
  constructor: "convertir tu libertad financiera en números",
  liberador: "ordenar el ataque a tus deudas",
  navegante: "recuperar liquidez y aire",
  organizador: "ver tu dinero con claridad",
  clarificador: "ver tus números sin ruido",
  protector: "asegurar tu base antes de crecer",
  estratega: "medir tu patrimonio y optimizar",
  creador: "equilibrar tu estilo de vida con tu patrimonio",
  guardian: "proteger a los tuyos con un plan",
  disfrutador: "disfrutar con un plan que te respalde",
};

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

  // ── Lectura espejo (Cierre v3) ──
  const heroLine = HERO_BY_ARCHETYPE[arche.primary];
  const moneyScriptReading = arche.moneyScript
    ? MONEY_SCRIPT_READING[arche.moneyScript]
    : undefined;
  const growth = riskClass === "crecimiento" || riskClass === "agresivo";

  // Superpoder (primer caso que aplique).
  const superpower =
    typeof d.discipline === "number" && d.discipline >= 7
      ? {
          title: "Tu superpoder: consistencia con visión de largo plazo",
          body: "La mayoría falla porque no puede sostener el plan. En ti la disciplina aparece como fortaleza central; conectada a un sistema medible, se vuelve una ventaja enorme.",
        }
      : typeof d.impulsivity === "number" && d.impulsivity <= 3
        ? {
            title: "Tu superpoder: autocontrol",
            body: "Tu baja impulsividad te protege de las decisiones que descarrilan a la mayoría. Es una base excelente para construir.",
          }
        : advanced
          ? {
              title: "Tu superpoder: criterio financiero",
              body: "Manejas los conceptos con soltura, así que podemos ir directo a estrategia, sin rodeos.",
            }
          : typeof d.perceivedControl === "number" && d.perceivedControl >= 7
            ? {
                title: "Tu superpoder: claridad",
                body: "Sientes el control de tus finanzas; eso te deja decidir con cabeza fría.",
              }
            : {
                title: "Tu superpoder: la decisión de empezar",
                body: "Diste el paso de conocerte financieramente. Ese es el inicio de todo cambio sostenible.",
              };

  // Riesgo oculto (en positivo; primer caso que aplique).
  const hiddenRisk = growth
    ? {
        title: "Lo que debes cuidar: crecer con base",
        body: "Tu ambición es una ventaja, pero necesita reglas. Tu principal cuidado no parece ser gastar de más, sino avanzar rápido sin validar liquidez, diversificación y protección. Crecimiento con estrategia, no por impulso.",
      }
    : typeof d.impulsivity === "number" && d.impulsivity >= 7
      ? {
          title: "Lo que debes cuidar: el impulso",
          body: "Tu mayor cuidado está en las compras de momento. Con reglas simples —una pausa, un monto libre— tu impulso deja de competir con tus metas.",
        }
      : typeof d.discipline === "number" && d.discipline <= 4
        ? {
            title: "Lo que debes cuidar: sostener el plan",
            body: "Tu reto no es saber qué hacer, sino mantenerlo en el tiempo. Hábitos pequeños y automáticos te cuidan más que la fuerza de voluntad.",
          }
        : noFund
          ? {
              title: "Lo que debes cuidar: tu base",
              body: "Tu ambición va por delante de tu colchón. Asegurar tu fondo de emergencia primero hace que todo lo demás se sostenga.",
            }
          : {
              title: "Lo que debes cuidar: el entusiasmo inicial",
              body: "Tu mayor cuidado es mantener la constancia cuando pase la motivación del arranque. El sistema, no la motivación, es lo que sostiene.",
            };

  // "Lo que esto dice de ti" (fallback determinista del card de IA).
  const highControl = typeof d.perceivedControl === "number" && d.perceivedControl >= 8;
  const urgent = d.urgency === "critica" || d.urgency === "alta";
  const disciplined = typeof d.discipline === "number" && d.discipline >= 7;
  const whatThisSays =
    highControl && urgent
      ? "Tus respuestas muestran algo interesante: tienes control y a la vez urgencia. No estás apagando incendios — estás cerrando brechas de largo plazo. Tu reto no es ordenarte, es acelerar con estrategia."
      : disciplined && growth
        ? "No buscas ordenarte porque estés perdido, sino para construir sobre algo firme. Tu reto es convertir tu visión en una arquitectura medible."
        : `${play.userSummary} Tu siguiente paso es convertir eso en un sistema.`;

  // Próxima jugada.
  const phrase = NEXT_MOVE_PHRASE[arche.primary];
  const nextMove = {
    title: `Tu próxima jugada: ${phrase}`,
    body: `Antes de avanzar, CARTERA+ construye tu fotografía base: ingresos, gastos, activos, pasivos, liquidez y tu capacidad real de inversión. Ese es tu punto de partida para ${phrase}.`,
    cta: "Crear mi mapa financiero en 7 minutos",
    timeEstimate: "7 minutos",
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
    name: d.displayName,
    heroLine,
    moneyScriptReading,
    whatThisSays,
    superpower,
    hiddenRisk,
    nextMove,
  };
}
