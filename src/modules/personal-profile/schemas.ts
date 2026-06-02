/** Validación Zod del borrador del perfil (todo opcional: guardado progresivo). */
import { z } from "zod";

const scale = z.number().int().min(1).max(10);

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
  dependentsCount: z.number().int().min(0).max(30).optional(),

  lifeStage: z.string().max(40).optional(),
  perceivedControl: scale.optional(),
  satisfaction: scale.optional(),
  urgency: z.enum(["baja", "media", "alta", "critica"]).optional(),
  mainConcern: z.string().max(60).optional(),

  goals: z.array(z.string().max(60)).max(20).optional(),
  goalDetails: z.array(goalDraftSchema).max(20).optional(),
  priorities: z.array(z.string().max(60)).max(10).optional(),
  willingToSacrifice: z.array(z.string().max(60)).max(20).optional(),

  discipline: scale.optional(),
  impulsivity: scale.optional(),
  consistency: scale.optional(),
  reviewHabit: z.string().max(40).optional(),
  hardest: z.array(z.string().max(60)).max(20).optional(),

  knowledgeLevel: z.enum(["basico", "intermedio", "avanzado", "experto"]).optional(),
  topicsKnown: z.array(z.string().max(60)).max(30).optional(),
  topicsToLearn: z.array(z.string().max(60)).max(30).optional(),

  lossReaction: z.string().max(40).optional(),
  riskPreference: z.enum(["seguridad", "equilibrio", "crecimiento"]).optional(),
  investHorizon: z.string().max(40).optional(),
  hasInvested: z.boolean().optional(),
  volatilityComfort: scale.optional(),

  hasEmergencyFund: z.enum(["si", "no", "construyendo", "no_se"]).optional(),
  insurances: z.array(z.string().max(40)).max(20).optional(),

  coachingTone: z.string().max(40).optional(),
  coachingFrequency: z.string().max(40).optional(),
  alertIntensity: z.string().max(40).optional(),

  richLifeVision: z.string().max(2000).optional(),
  richLifePhrase: z.string().max(60).optional(),
});

export type ProfileDraftInput = z.infer<typeof profileDraftSchema>;
