/**
 * Tipos del Módulo 1 — Mi Perfil Financiero.
 * El `ProfileDraft` es el estado del Setup Wizard (guardado progresivo).
 */

export type LifeStage =
  | "ordenar"
  | "vivir_al_dia"
  | "salir_deudas"
  | "ahorrar_mejor"
  | "empezar_invertir"
  | "hacer_crecer"
  | "proteger_familia"
  | "libertad_financiera"
  | "prepararme_retiro"
  | "emprender";

export type Urgency = "baja" | "media" | "alta" | "critica";
export type RiskClass = "conservador" | "moderado" | "balanceado" | "crecimiento" | "agresivo";
export type FinancialNucleus = "solo" | "pareja" | "familia" | "socios" | "otro";
export type KnowledgeLevel = "basico" | "intermedio" | "avanzado" | "experto";

export type GoalDraft = {
  name: string;
  targetAmount?: number;
  targetDate?: string;
  priority?: "alta" | "media" | "baja";
};

export type ProfileDraft = {
  // Identidad
  displayName?: string;
  age?: number;
  country?: string;
  primaryCurrency?: string;
  maritalStatus?: string;
  financialNucleus?: FinancialNucleus;
  /** Emails de miembros invitados cuando el núcleo es "familia" (hasta 4). */
  householdMemberEmails?: string[];
  dependentsCount?: number;

  // Etapa financiera
  lifeStage?: LifeStage;
  perceivedControl?: number; // 1-10
  satisfaction?: number; // 1-10
  urgency?: Urgency;
  /** Preocupación principal (primera de mainConcerns; se conserva por compat). */
  mainConcern?: string;
  /** Preocupaciones seleccionadas (hasta 5) — más contexto para la IA. */
  mainConcerns?: string[];
  /** Paso 3 · emoción dominante respondida directo (sustituye la inferencia). */
  dominantEmotionAnswer?: string; // 3.2
  /** Paso 3 · la única cosa que querría resolver este mes. */
  singleProblem?: string; // 3.3

  // Objetivos y prioridades
  goals?: string[]; // claves de objetivos seleccionados
  goalDetails?: GoalDraft[];
  priorities?: string[]; // top prioridades ordenadas
  willingToSacrifice?: string[];
  /** Paso 5 · lo que el dinero debería darle primero (narrativa de valor). */
  dineroPrimero?: string; // 5.2
  /** Paso 5 · la frase con la que más conecta. */
  conectaFrase?: string; // 5.3

  // Comportamiento
  discipline?: number;
  impulsivity?: number;
  consistency?: number;
  reviewHabit?: string;
  hardest?: string[];

  // Paso 6 · psicología del dinero (Fase 3a). Claves de la opción elegida.
  incomeReaction?: string; // 6.1
  stressSpending?: string; // 6.2
  unplannedPurchase?: string; // 6.4
  socialComparison?: string; // 6.5
  moneyScriptPhrase?: string; // 6.6 (clave de la frase elegida)

  // Conocimiento
  knowledgeLevel?: KnowledgeLevel;
  topicsKnown?: string[];
  topicsToLearn?: string[];
  /** Paso 7 · personalización (Fase 3c). */
  explainStyle?: string; // 7.2
  decisionComfort?: string; // 7.4

  // Riesgo
  lossReaction?: string;
  riskPreference?: "seguridad" | "equilibrio" | "crecimiento";
  investHorizon?: string;
  hasInvested?: boolean;
  volatilityComfort?: number;

  // Protección
  hasEmergencyFund?: "si" | "no" | "construyendo" | "no_se";
  insurances?: string[];
  /** Paso 9 · personalización (Fase 3c). */
  incomeStopCoverage?: string; // 9.2
  protectionPerceived?: string; // 9.4

  // Acompañamiento
  coachingTone?: string;
  coachingFrequency?: string;
  alertIntensity?: string;
  /** Paso 10 · personalización (Fase 3c). */
  alertStyle?: string; // 10.2
  interventionStyle?: string; // 10.5

  // Rich Life
  richLifeVision?: string;
  richLifePhrase?: string;
  /** Paso 11 · personalización (Fase 3c). */
  futureImage?: string; // 11.3
  desiredFeeling?: string[]; // 11.4 (máx 3)
};

/** Arquetipo conductual del usuario (nombre POSITIVO, nunca etiqueta negativa). */
export type Archetype =
  | "organizador"
  | "navegante"
  | "liberador"
  | "disfrutador"
  | "clarificador"
  | "protector"
  | "estratega"
  | "creador"
  | "guardian"
  | "constructor";

/** "Money script": creencia profunda sobre el dinero (deriva de la frase elegida). */
export type MoneyScript =
  | "evitacion"
  | "vigilancia"
  | "estatus"
  | "seguridad"
  | "crecimiento"
  | "suficiencia";

export type DominantEmotion =
  | "tranquilidad"
  | "motivacion"
  | "confusion"
  | "presion"
  | "culpa"
  | "miedo"
  | "frustracion"
  | "evasion";

export type ArchetypeResult = {
  primary: Archetype;
  secondary: Archetype | null;
  dominantEmotion: DominantEmotion;
  /** Descriptor corto del tono recomendado (del playbook). */
  recommendedTone: string;
  /** Foco inicial sugerido (del playbook). */
  initialFocus: string;
  /** Creencia dominante sobre el dinero (de la frase del Paso 6), si la hay. */
  moneyScript: MoneyScript | null;
  scores: Record<Archetype, number>;
};

/** Una métrica del scorecard del cierre (valor + lectura corta). */
export type ScoreItem = { label: string; value: string; reading: string };

/** Lectura conductual del cierre del onboarding (determinista, 2ª persona). */
export type ProfileReading = {
  interpretation: string;
  riskDisplay: string;
  riskReading: string;
  scorecard: ScoreItem[];
  strengths: string[];
  opportunities: string[];
  companionship: { tone: string; priorities: string[]; avoids: string[] };
  route: { step: string; why: string }[];
  // Lectura espejo (Cierre v3): piezas narrativas en 2ª persona.
  name?: string;
  heroLine: string;
  moneyScriptReading?: string;
  /** Fallback determinista del card de IA ("Lo que esto dice de ti"). */
  whatThisSays: string;
  superpower: { title: string; body: string };
  hiddenRisk: { title: string; body: string };
  nextMove: { title: string; body: string; cta: string; timeEstimate?: string };
};

export type ProfileDiagnosis = {
  riskClass: RiskClass;
  stageSummary: string;
  /** Texto principal del diagnóstico ("Tu perfil financiero inicial…"). */
  narrative: string;
  /** Ruta sugerida inicial (pasos). */
  suggestedPath: string[];
  /** % de completitud del perfil (0-100). */
  completion: number;
  // Arquetipo conductual (Fase 2), opcionales.
  archetypePrimary?: Archetype;
  archetypeSecondary?: Archetype | null;
  dominantEmotion?: DominantEmotion;
  recommendedTone?: string;
  initialFocus?: string;
  moneyScript?: MoneyScript;
  // Pantalla de cierre (Fase 3d): etiquetas y significado en positivo.
  archetypeLabel?: string;
  archetypeLabel2?: string;
  archetypeMeaning?: string;
  /** Lectura conductual completa del cierre (Fase A1). */
  reading?: ProfileReading;
};
