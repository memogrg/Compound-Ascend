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

  // Riesgo
  lossReaction?: string;
  riskPreference?: "seguridad" | "equilibrio" | "crecimiento";
  investHorizon?: string;
  hasInvested?: boolean;
  volatilityComfort?: number;

  // Protección
  hasEmergencyFund?: "si" | "no" | "construyendo" | "no_se";
  insurances?: string[];

  // Acompañamiento
  coachingTone?: string;
  coachingFrequency?: string;
  alertIntensity?: string;

  // Rich Life
  richLifeVision?: string;
  richLifePhrase?: string;
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
};
