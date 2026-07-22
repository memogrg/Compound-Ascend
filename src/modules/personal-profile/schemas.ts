/** Validación Zod del borrador del perfil (todo opcional: guardado progresivo). */
import { z } from "zod";

const scale = z.number().int().min(1).max(5);
/** Campo de RANKING: hasta 3 respuestas ORDENADAS por prioridad (primera = primaria). */
const ranked = z.array(z.string().max(60)).max(3);

export const goalDraftSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetAmount: z.number().nonnegative().optional(),
  targetDate: z.string().optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
});

export const profileDraftSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  age: z.number().int().min(0).max(120).optional(),
  country: z.string().trim().max(80).optional(),
  primaryCurrency: z.string().length(3).optional(),
  maritalStatus: z.string().max(40).optional(),
  financialNucleus: z.enum(["solo", "pareja", "familia", "socios", "otro"]).optional(),
  // Strings libres aquí (no bloquear el guardado progresivo con emails a medio
  // escribir); el formato de email se valida en la UI y al invitar.
  householdMemberEmails: z.array(z.string().trim().max(120)).max(4).optional(),
  dependentsCount: z.number().int().min(0).max(30).optional(),

  lifeStage: ranked.optional(),
  perceivedControl: scale.optional(),
  satisfaction: scale.optional(),
  urgency: z.enum(["baja", "media", "alta", "critica"]).optional(),
  mainConcern: z.string().max(60).optional(),
  mainConcerns: ranked.optional(),
  // Paso 3 · emoción directa y problema único (Fase 3b) — ranking.
  dominantEmotionAnswer: ranked.optional(),
  singleProblem: ranked.optional(),

  goals: ranked.optional(),
  goalDetails: z.array(goalDraftSchema).max(20).optional(),
  priorities: ranked.optional(),
  willingToSacrifice: z.array(z.string().max(60)).max(20).optional(),
  // Paso 5 · narrativa de valor (Fase 3b) — ranking.
  dineroPrimero: ranked.optional(),
  conectaFrase: ranked.optional(),

  discipline: scale.optional(),
  impulsivity: scale.optional(),
  consistency: scale.optional(),
  reviewHabit: z.string().max(40).optional(),
  hardest: ranked.optional(),

  // Paso 6 · psicología del dinero (Fase 3a) — ranking.
  incomeReaction: ranked.optional(),
  stressSpending: ranked.optional(),
  unplannedPurchase: ranked.optional(),
  socialComparison: ranked.optional(),
  moneyScriptPhrase: ranked.optional(),

  knowledgeLevel: z.enum(["basico", "intermedio", "avanzado", "experto"]).optional(),
  topicsKnown: z.array(z.string().max(60)).max(30).optional(),
  topicsToLearn: z.array(z.string().max(60)).max(30).optional(),
  // Paso 7 · personalización (Fase 3c).
  explainStyle: z.string().max(40).optional(),
  decisionComfort: z.string().max(40).optional(),

  lossReaction: ranked.optional(),
  riskPreference: z.enum(["seguridad", "equilibrio", "crecimiento"]).optional(),
  investHorizon: z.string().max(40).optional(),
  hasInvested: z.boolean().optional(),
  volatilityComfort: scale.optional(),

  hasEmergencyFund: z.enum(["si", "no", "construyendo", "no_se"]).optional(),
  insurances: z.array(z.string().max(40)).max(20).optional(),
  // Paso 9 · personalización (Fase 3c).
  incomeStopCoverage: z.string().max(40).optional(),
  protectionPerceived: z.string().max(40).optional(),

  coachingTone: z.string().max(40).optional(),
  coachingFrequency: z.string().max(40).optional(),
  alertIntensity: z.string().max(40).optional(),
  // Paso 10 · personalización (Fase 3c) — ranking.
  alertStyle: ranked.optional(),
  interventionStyle: ranked.optional(),

  richLifeVision: z.string().max(2000).optional(),
  richLifePhrase: ranked.optional(),
  // Paso 11 · personalización (Fase 3c) — ranking.
  futureImage: ranked.optional(),
  desiredFeeling: z.array(z.string().max(40)).max(3).optional(),
});

export type ProfileDraftInput = z.infer<typeof profileDraftSchema>;
