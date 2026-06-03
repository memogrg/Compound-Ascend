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

  // Objetivos y prioridades
  goals?: string[]; // claves de objetivos seleccionados
  goalDetails?: GoalDraft[];
  priorities?: string[]; // top prioridades ordenadas
  willingToSacrifice?: string[];

  // Comportamiento
  discipline?: number;
  impulsivity?: number;
  consistency?: number;
  reviewHabit?: string;
  hardest?: string[];

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

export type ProfileDiagnosis = {
  riskClass: RiskClass;
  stageSummary: string;
  /** Texto principal del diagnóstico ("Tu perfil financiero inicial…"). */
  narrative: string;
  /** Ruta sugerida inicial (pasos). */
  suggestedPath: string[];
  /** % de completitud del perfil (0-100). */
  completion: number;
};
