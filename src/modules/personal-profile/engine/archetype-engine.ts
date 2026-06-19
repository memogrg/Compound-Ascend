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
  MoneyScript,
  ProfileDraft,
} from "@/modules/personal-profile/types";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";

/** Frase del Paso 6 → "money script" (creencia dominante sobre el dinero). */
const MONEY_SCRIPT_BY_PHRASE: Record<string, MoneyScript> = {
  no_se_donde: "evitacion",
  controlo_todo: "vigilancia",
  merezco_disfrutar: "estatus",
  mas_seguridad: "seguridad",
  construya_futuro: "crecimiento",
  incomoda_hablar: "evitacion",
  voy_tarde: "estatus",
  aprender: "crecimiento",
  familia_depende: "seguridad",
  realmente_bien: "suficiencia",
};

/** Deriva el money script de la frase elegida (null si no eligió). */
export function deriveMoneyScript(d: ProfileDraft): MoneyScript | null {
  return d.moneyScriptPhrase ? (MONEY_SCRIPT_BY_PHRASE[d.moneyScriptPhrase] ?? null) : null;
}

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
/** Mapa de la respuesta directa del Paso 3 a la emoción dominante. */
const EMOTION_ANSWER: Record<string, DominantEmotion> = {
  tranquilidad: "tranquilidad",
  motivacion: "motivacion",
  confusion: "confusion",
  presion: "presion",
  culpa: "culpa",
  miedo: "miedo",
  frustracion: "frustracion",
  evito: "evasion",
};

function inferDominantEmotion(d: ProfileDraft, concerns: string[]): DominantEmotion {
  // Respuesta directa (Paso 3): si el usuario la dio, SUSTITUYE toda inferencia.
  if (d.dominantEmotionAnswer && EMOTION_ANSWER[d.dominantEmotionAnswer]) {
    return EMOTION_ANSWER[d.dominantEmotionAnswer]!;
  }
  if (d.urgency === "critica" || d.urgency === "alta") return "presion";
  if (concerns.includes("fin_de_mes") || concerns.includes("deudas")) return "presion";
  if (d.reviewHabit === "nunca" || d.reviewHabit === "problemas") return "evasion";
  // Señales del Paso 6 (antes de los fallbacks de etapa/control).
  if (d.stressSpending === "gusto") return "culpa";
  if (d.stressSpending === "no_gasto_ansiedad") return "miedo";
  if (
    d.socialComparison === "presiona" ||
    d.socialComparison === "atrasado" ||
    d.socialComparison === "cuestiono"
  ) {
    return "frustracion";
  }
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

  // ── Paso 6 · psicología del dinero (Fase 3a) ──
  switch (d.incomeReaction) {
    case "distribuyo":
      add("organizador", 2);
      break;
    case "pago_urgente":
      add("navegante", 2);
      break;
    case "gasto_mas":
      add("disfrutador", 2);
      break;
    case "guardo":
      add("protector", 2);
      break;
    case "invierto":
      add("constructor", 2);
      break;
    case "no_se":
      add("clarificador", 2);
      break;
    case "familia":
      add("guardian", 2);
      break;
  }
  switch (d.stressSpending) {
    case "gusto":
      add("disfrutador", 2);
      break;
    case "no_gasto_ansiedad":
      add("protector", 1);
      add("clarificador", 1);
      break;
    case "reviso_metas":
      add("estratega", 1);
      add("constructor", 1);
      break;
    case "automatico":
      add("clarificador", 1);
      add("navegante", 1);
      break;
    case "ahorro":
      add("protector", 1);
      break;
    case "animo":
      add("disfrutador", 1);
      break;
  }
  switch (d.unplannedPurchase) {
    case "compro":
      add("disfrutador", 2);
      break;
    case "reviso_presupuesto":
      add("organizador", 1);
      add("estratega", 1);
      break;
    case "evito":
      add("protector", 1);
      break;
    case "depende_dia":
      add("disfrutador", 1);
      break;
    case "compro_acomodo":
      add("navegante", 1);
      add("disfrutador", 1);
      break;
    case "merezco":
      add("disfrutador", 1);
      add("creador", 1);
      break;
    case "pienso":
      add("estratega", 1);
      break;
  }
  switch (d.socialComparison) {
    case "presiona":
      add("creador", 2);
      break;
    case "atrasado":
      add("creador", 1);
      add("clarificador", 1);
      break;
    case "gastar_mas":
      add("creador", 1);
      add("disfrutador", 1);
      break;
    case "cuestiono":
      add("creador", 1);
      break;
    case "motiva":
      add("constructor", 1);
      break;
    case "mis_metas":
      add("constructor", 1);
      break;
    case "igual":
      add("protector", 1);
      break;
  }
  switch (d.moneyScriptPhrase) {
    case "no_se_donde":
      add("clarificador", 1);
      break;
    case "controlo_todo":
      add("estratega", 1);
      add("protector", 1);
      break;
    case "merezco_disfrutar":
      add("disfrutador", 2);
      break;
    case "mas_seguridad":
      add("protector", 2);
      break;
    case "construya_futuro":
      add("constructor", 2);
      break;
    case "incomoda_hablar":
      add("clarificador", 2);
      break;
    case "voy_tarde":
      add("creador", 1);
      break;
    case "aprender":
      add("organizador", 1);
      add("clarificador", 1);
      break;
    case "familia_depende":
      add("guardian", 2);
      break;
    case "realmente_bien":
      add("constructor", 1);
      add("protector", 1);
      break;
  }

  // ── Pasos 3 y 5 · problema único y narrativa de valor (Fase 3b) ──
  switch (d.singleProblem) {
    case "salir_deuda":
      add("liberador", 2);
      break;
    case "construir_fondo":
      add("protector", 2);
      break;
    case "empezar_invertir":
      add("constructor", 2);
      break;
    case "proteger_familia":
      add("guardian", 2);
      break;
    case "ordenar_gastos":
      add("organizador", 1);
      break;
    case "crear_presupuesto":
      add("organizador", 1);
      break;
    case "ahorrar_algo":
      add("protector", 1);
      break;
    case "entender":
      add("clarificador", 1);
      break;
    case "dejar_estres":
      add("navegante", 1);
      add("clarificador", 1);
      break;
  }
  switch (d.dineroPrimero) {
    case "seguridad_familia":
      add("guardian", 2);
      break;
    case "crecimiento":
      add("constructor", 2);
      break;
    case "experiencias":
      add("creador", 2);
      break;
    case "menos_deudas":
      add("liberador", 2);
      break;
    case "tranquilidad":
      add("protector", 1);
      break;
    case "libertad":
      add("constructor", 1);
      break;
    case "control":
      add("estratega", 1);
      break;
    case "opciones":
      add("constructor", 1);
      break;
    case "menos_estres":
      add("navegante", 1);
      add("clarificador", 1);
      break;
  }
  switch (d.conectaFrase) {
    case "disfrutar_sin_desorden":
      add("disfrutador", 2);
      break;
    case "dinero_trabaje":
      add("constructor", 2);
      break;
    case "proteger":
      add("guardian", 2);
      break;
    case "dormir_tranquilo":
      add("protector", 1);
      break;
    case "no_voy_tarde":
      add("creador", 1);
      break;
    case "mas_opciones":
      add("constructor", 1);
      break;
    case "por_fin_control":
      add("estratega", 1);
      add("organizador", 1);
      break;
    case "avanzar_simple":
      add("organizador", 1);
      add("navegante", 1);
      break;
  }
  // Nudge leve por la emoción directa.
  switch (d.dominantEmotionAnswer) {
    case "culpa":
      add("disfrutador", 1);
      break;
    case "miedo":
      add("protector", 1);
      break;
    case "presion":
      add("navegante", 1);
      break;
    case "confusion":
      add("clarificador", 1);
      break;
    case "evito":
      add("clarificador", 1);
      break;
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
    moneyScript: deriveMoneyScript(d),
    scores,
  };
}
