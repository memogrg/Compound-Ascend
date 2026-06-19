/**
 * Motor de arquetipos conductuales (función pura, determinista, testeable).
 * Suma puntos por señal del borrador del perfil y deriva el arquetipo primario,
 * el secundario (si está cerca), la emoción dominante (best-effort) y el tono/foco
 * recomendados (del playbook). Sin IO. Los nombres de arquetipo son siempre
 * POSITIVOS (nunca etiquetas negativas).
 */
import type {
  Archetype,
  ArchetypeResult,
  DominantEmotion,
  ProfileDraft,
} from "@/modules/personal-profile/types";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";

const ARCHETYPES: Archetype[] = [
  "organizador",
  "navegante",
  "liberador",
  "disfrutador",
  "clarificador",
  "protector",
  "estratega",
  "creador",
  "guardian",
  "constructor",
];

/** Emoción dominante best-effort. La Fase 3 la reemplazará por respuesta directa. */
function inferDominantEmotion(d: ProfileDraft, concerns: string[]): DominantEmotion {
  if (d.urgency === "critica" || d.urgency === "alta") return "presion";
  if (concerns.includes("fin_de_mes") || concerns.includes("deudas")) return "presion";
  if (d.reviewHabit === "nunca" || d.reviewHabit === "problemas") return "evasion";
  if (
    d.lifeStage === "hacer_crecer" ||
    d.lifeStage === "empezar_invertir" ||
    d.lifeStage === "libertad_financiera"
  ) {
    return "motivacion";
  }
  if (typeof d.perceivedControl === "number") {
    if (d.perceivedControl <= 3) return "confusion";
    if (d.perceivedControl >= 8) return "tranquilidad";
  }
  return "motivacion";
}

export function computeArchetype(d: ProfileDraft): ArchetypeResult {
  const scores = Object.fromEntries(ARCHETYPES.map((a) => [a, 0])) as Record<Archetype, number>;
  const add = (a: Archetype, n: number) => {
    scores[a] += n;
  };

  // Etapa de vida.
  switch (d.lifeStage) {
    case "ordenar":
      add("organizador", 3);
      add("clarificador", 1);
      break;
    case "vivir_al_dia":
      add("navegante", 3);
      break;
    case "salir_deudas":
      add("liberador", 4);
      break;
    case "ahorrar_mejor":
      add("protector", 1);
      add("organizador", 1);
      break;
    case "empezar_invertir":
      add("constructor", 2);
      break;
    case "hacer_crecer":
      add("constructor", 3);
      break;
    case "proteger_familia":
      add("guardian", 3);
      add("protector", 1);
      break;
    case "libertad_financiera":
      add("constructor", 2);
      break;
    case "prepararme_retiro":
      add("guardian", 1);
      add("constructor", 1);
      break;
    case "emprender":
      add("creador", 1);
      add("constructor", 1);
      break;
  }

  // Preocupaciones (cada una suma).
  const concerns = d.mainConcerns ?? (d.mainConcern ? [d.mainConcern] : []);
  for (const c of concerns) {
    switch (c) {
      case "deudas":
        add("liberador", 3);
        break;
      case "fin_de_mes":
        add("navegante", 2);
        break;
      case "claridad":
        add("clarificador", 2);
        add("organizador", 1);
        break;
      case "sin_emergencia":
        add("protector", 2);
        break;
      case "sin_proteccion":
        add("guardian", 2);
        break;
      case "no_invertir":
        add("constructor", 1);
        break;
      case "retiro":
        add("guardian", 1);
        add("constructor", 1);
        break;
    }
  }

  // Riesgo.
  if (d.riskPreference === "seguridad") add("protector", 2);
  if (d.riskPreference === "crecimiento") add("constructor", 2);
  if (d.lossReaction === "vendo") add("protector", 2);
  if (d.lossReaction === "invierto_mas") add("constructor", 2);
  if (d.hasEmergencyFund === "no" || d.hasEmergencyFund === "no_se") add("protector", 1);

  // Núcleo y dependientes.
  if (d.financialNucleus === "familia") add("guardian", 3);
  if (typeof d.dependentsCount === "number" && d.dependentsCount > 0) add("guardian", 2);

  // Conocimiento.
  if (d.knowledgeLevel === "avanzado" || d.knowledgeLevel === "experto") add("estratega", 2);
  if (d.knowledgeLevel === "basico") {
    add("organizador", 1);
    add("clarificador", 1);
  }

  // Hábito de revisión.
  if (d.reviewHabit === "nunca" || d.reviewHabit === "problemas") add("clarificador", 2);
  if (d.reviewHabit === "diario") add("estratega", 3);

  // Comportamiento.
  if (typeof d.impulsivity === "number" && d.impulsivity >= 7) {
    add("disfrutador", 3);
    add("creador", 1);
  }
  const hardest = d.hardest ?? [];
  if (hardest.includes("decir_no")) add("disfrutador", 2);
  if (hardest.includes("controlar_gastos")) {
    add("disfrutador", 1);
    add("navegante", 1);
  }

  // Prioridades.
  const priorities = d.priorities ?? [];
  if (priorities.includes("experiencias")) {
    add("creador", 2);
    add("disfrutador", 1);
  }
  if (priorities.includes("seguridad") || priorities.includes("tranquilidad")) add("protector", 1);
  if (priorities.includes("patrimonio")) add("constructor", 1);
  if (priorities.includes("familia")) add("guardian", 1);

  // Disciplina baja.
  if (typeof d.discipline === "number" && d.discipline <= 3) {
    add("organizador", 1);
    add("navegante", 1);
  }

  // Primario = mayor; secundario = 2º si > 0 y a ≤ 2 pts del primario. Empates
  // resueltos por el orden de ARCHETYPES (sort estable). Todo 0 → "organizador".
  const ranked = ARCHETYPES.map((a) => ({ a, s: scores[a] })).sort((x, y) => y.s - x.s);
  const top = ranked[0]!;
  const primary: Archetype = top.s > 0 ? top.a : "organizador";
  let secondary: Archetype | null = null;
  if (top.s > 0) {
    const second = ranked[1]!;
    if (second.s > 0 && top.s - second.s <= 2) secondary = second.a;
  }

  const playbook = ARCHETYPE_PLAYBOOKS[primary];
  return {
    primary,
    secondary,
    dominantEmotion: inferDominantEmotion(d, concerns),
    recommendedTone: playbook.recommendedTone,
    initialFocus: playbook.initialFocus,
    scores,
  };
}
