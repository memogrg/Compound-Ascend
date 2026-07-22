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
import { RANK_WEIGHTS, primaryOf } from "@/modules/personal-profile/engine/ranking";

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

/** Deriva el money script de la frase PRIMARIA elegida (null si no eligió). */
export function deriveMoneyScript(d: ProfileDraft): MoneyScript | null {
  const primary = primaryOf(d.moneyScriptPhrase);
  return primary ? (MONEY_SCRIPT_BY_PHRASE[primary] ?? null) : null;
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
  // Respuesta directa (Paso 3): la PRIMARIA sustituye toda inferencia.
  const emotionAnswer = primaryOf(d.dominantEmotionAnswer);
  if (emotionAnswer && EMOTION_ANSWER[emotionAnswer]) {
    return EMOTION_ANSWER[emotionAnswer]!;
  }
  if (d.urgency === "critica" || d.urgency === "alta") return "presion";
  if (concerns.includes("fin_de_mes") || concerns.includes("deudas")) return "presion";
  if (d.reviewHabit === "nunca" || d.reviewHabit === "problemas") return "evasion";
  // Señales del Paso 6 (por respuesta primaria; antes de los fallbacks de etapa/control).
  const stress = primaryOf(d.stressSpending);
  if (stress === "gusto") return "culpa";
  if (stress === "no_gasto_ansiedad") return "miedo";
  const social = primaryOf(d.socialComparison);
  if (social === "presiona" || social === "atrasado" || social === "cuestiono") {
    return "frustracion";
  }
  const stage = primaryOf(d.lifeStage);
  if (stage === "hacer_crecer" || stage === "empezar_invertir" || stage === "libertad_financiera") {
    return "motivacion";
  }
  // Escala 1-5: <=2 (tercio bajo) → confusión; >=4 (tercio alto) → tranquilidad.
  if (typeof d.perceivedControl === "number") {
    if (d.perceivedControl <= 2) return "confusion";
    if (d.perceivedControl >= 4) return "tranquilidad";
  }
  return "motivacion";
}

export function computeArchetype(d: ProfileDraft): ArchetypeResult {
  const scores = Object.fromEntries(ARCHETYPES.map((a) => [a, 0])) as Record<Archetype, number>;
  const add = (a: Archetype, n: number) => {
    scores[a] += n;
  };
  // Itera un campo RANKEADO aplicando el peso del rango (1 / 0.6 / 0.3): la primaria puntúa
  // igual que cuando era respuesta única (cero regresión); la 2ª y 3ª suman con menos peso.
  const eachRanked = (
    field: string[] | undefined,
    fn: (value: string, addw: (a: Archetype, n: number) => void) => void,
  ) => {
    (field ?? []).forEach((value, i) => {
      const w = RANK_WEIGHTS[i];
      if (w === undefined) return; // más allá del top-3 no puntúa
      fn(value, (a, n) => add(a, n * w));
    });
  };

  // Etapa de vida (ranking).
  eachRanked(d.lifeStage, (stage, addw) => {
    switch (stage) {
      case "ordenar": addw("organizador", 3); addw("clarificador", 1); break;
      case "vivir_al_dia": addw("navegante", 3); break;
      case "salir_deudas": addw("liberador", 4); break;
      case "ahorrar_mejor": addw("protector", 1); addw("organizador", 1); break;
      case "empezar_invertir": addw("constructor", 2); break;
      case "hacer_crecer": addw("constructor", 3); break;
      case "proteger_familia": addw("guardian", 3); addw("protector", 1); break;
      case "libertad_financiera": addw("constructor", 2); break;
      case "prepararme_retiro": addw("guardian", 1); addw("constructor", 1); break;
      case "emprender": addw("creador", 1); addw("constructor", 1); break;
    }
  });

  // Preocupaciones (ranking; legacy mainConcern como fallback envuelto en array).
  const concerns = d.mainConcerns ?? (d.mainConcern ? [d.mainConcern] : []);
  eachRanked(concerns, (c, addw) => {
    switch (c) {
      case "deudas": addw("liberador", 3); break;
      case "fin_de_mes": addw("navegante", 2); break;
      case "claridad": addw("clarificador", 2); addw("organizador", 1); break;
      case "sin_emergencia": addw("protector", 2); break;
      case "sin_proteccion": addw("guardian", 2); break;
      case "no_invertir": addw("constructor", 1); break;
      case "retiro": addw("guardian", 1); addw("constructor", 1); break;
    }
  });

  // Riesgo.
  if (d.riskPreference === "seguridad") add("protector", 2);
  if (d.riskPreference === "crecimiento") add("constructor", 2);
  eachRanked(d.lossReaction, (lr, addw) => {
    if (lr === "vendo") addw("protector", 2);
    else if (lr === "invierto_mas") addw("constructor", 2);
  });
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

  // Comportamiento. Escala 1-5: impulsividad alta = >=4 (antes >=7 en 1-10).
  if (typeof d.impulsivity === "number" && d.impulsivity >= 4) {
    add("disfrutador", 3);
    add("creador", 1);
  }
  eachRanked(d.hardest, (h, addw) => {
    if (h === "decir_no") addw("disfrutador", 2);
    else if (h === "controlar_gastos") { addw("disfrutador", 1); addw("navegante", 1); }
  });

  // Prioridades (ranking).
  eachRanked(d.priorities, (p, addw) => {
    if (p === "experiencias") { addw("creador", 2); addw("disfrutador", 1); }
    else if (p === "seguridad" || p === "tranquilidad") addw("protector", 1);
    else if (p === "patrimonio") addw("constructor", 1);
    else if (p === "familia") addw("guardian", 1);
  });

  // Disciplina baja. Escala 1-5: baja = <=2 (antes <=3 en 1-10).
  if (typeof d.discipline === "number" && d.discipline <= 2) {
    add("organizador", 1);
    add("navegante", 1);
  }

  // ── Paso 6 · psicología del dinero (Fase 3a) — ranking ──
  eachRanked(d.incomeReaction, (v, addw) => {
    switch (v) {
      case "distribuyo": addw("organizador", 2); break;
      case "pago_urgente": addw("navegante", 2); break;
      case "gasto_mas": addw("disfrutador", 2); break;
      case "guardo": addw("protector", 2); break;
      case "invierto": addw("constructor", 2); break;
      case "no_se": addw("clarificador", 2); break;
      case "familia": addw("guardian", 2); break;
    }
  });
  eachRanked(d.stressSpending, (v, addw) => {
    switch (v) {
      case "gusto": addw("disfrutador", 2); break;
      case "no_gasto_ansiedad": addw("protector", 1); addw("clarificador", 1); break;
      case "reviso_metas": addw("estratega", 1); addw("constructor", 1); break;
      case "automatico": addw("clarificador", 1); addw("navegante", 1); break;
      case "ahorro": addw("protector", 1); break;
      case "animo": addw("disfrutador", 1); break;
    }
  });
  eachRanked(d.unplannedPurchase, (v, addw) => {
    switch (v) {
      case "compro": addw("disfrutador", 2); break;
      case "reviso_presupuesto": addw("organizador", 1); addw("estratega", 1); break;
      case "evito": addw("protector", 1); break;
      case "depende_dia": addw("disfrutador", 1); break;
      case "compro_acomodo": addw("navegante", 1); addw("disfrutador", 1); break;
      case "merezco": addw("disfrutador", 1); addw("creador", 1); break;
      case "pienso": addw("estratega", 1); break;
    }
  });
  eachRanked(d.socialComparison, (v, addw) => {
    switch (v) {
      case "presiona": addw("creador", 2); break;
      case "atrasado": addw("creador", 1); addw("clarificador", 1); break;
      case "gastar_mas": addw("creador", 1); addw("disfrutador", 1); break;
      case "cuestiono": addw("creador", 1); break;
      case "motiva": addw("constructor", 1); break;
      case "mis_metas": addw("constructor", 1); break;
      case "igual": addw("protector", 1); break;
    }
  });
  eachRanked(d.moneyScriptPhrase, (v, addw) => {
    switch (v) {
      case "no_se_donde": addw("clarificador", 1); break;
      case "controlo_todo": addw("estratega", 1); addw("protector", 1); break;
      case "merezco_disfrutar": addw("disfrutador", 2); break;
      case "mas_seguridad": addw("protector", 2); break;
      case "construya_futuro": addw("constructor", 2); break;
      case "incomoda_hablar": addw("clarificador", 2); break;
      case "voy_tarde": addw("creador", 1); break;
      case "aprender": addw("organizador", 1); addw("clarificador", 1); break;
      case "familia_depende": addw("guardian", 2); break;
      case "realmente_bien": addw("constructor", 1); addw("protector", 1); break;
    }
  });

  // ── Pasos 3 y 5 · problema único y narrativa de valor (Fase 3b) — ranking ──
  eachRanked(d.singleProblem, (v, addw) => {
    switch (v) {
      case "salir_deuda": addw("liberador", 2); break;
      case "construir_fondo": addw("protector", 2); break;
      case "empezar_invertir": addw("constructor", 2); break;
      case "proteger_familia": addw("guardian", 2); break;
      case "ordenar_gastos": addw("organizador", 1); break;
      case "crear_presupuesto": addw("organizador", 1); break;
      case "ahorrar_algo": addw("protector", 1); break;
      case "entender": addw("clarificador", 1); break;
      case "dejar_estres": addw("navegante", 1); addw("clarificador", 1); break;
    }
  });
  eachRanked(d.dineroPrimero, (v, addw) => {
    switch (v) {
      case "seguridad_familia": addw("guardian", 2); break;
      case "crecimiento": addw("constructor", 2); break;
      case "experiencias": addw("creador", 2); break;
      case "menos_deudas": addw("liberador", 2); break;
      case "tranquilidad": addw("protector", 1); break;
      case "libertad": addw("constructor", 1); break;
      case "control": addw("estratega", 1); break;
      case "opciones": addw("constructor", 1); break;
      case "menos_estres": addw("navegante", 1); addw("clarificador", 1); break;
    }
  });
  eachRanked(d.conectaFrase, (v, addw) => {
    switch (v) {
      case "disfrutar_sin_desorden": addw("disfrutador", 2); break;
      case "dinero_trabaje": addw("constructor", 2); break;
      case "proteger": addw("guardian", 2); break;
      case "dormir_tranquilo": addw("protector", 1); break;
      case "no_voy_tarde": addw("creador", 1); break;
      case "mas_opciones": addw("constructor", 1); break;
      case "por_fin_control": addw("estratega", 1); addw("organizador", 1); break;
      case "avanzar_simple": addw("organizador", 1); addw("navegante", 1); break;
    }
  });
  // Nudge leve por la emoción directa (ranking).
  eachRanked(d.dominantEmotionAnswer, (v, addw) => {
    switch (v) {
      case "culpa": addw("disfrutador", 1); break;
      case "miedo": addw("protector", 1); break;
      case "presion": addw("navegante", 1); break;
      case "confusion": addw("clarificador", 1); break;
      case "evito": addw("clarificador", 1); break;
    }
  });

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
