/**
 * Modelo de planes y gating de funciones (módulo puro). Fuente única de verdad
 * para qué incluye cada plan. La monetización es ética: primero valor, luego
 * oferta; nunca se bloquea el diagnóstico, solo el acompañamiento avanzado.
 */
import { PLAN_TOKEN_LIMITS } from "@/lib/ai/limits";

export type Plan = "free" | "premium";

export type Feature =
  | "ai_chat"
  | "receipt_scanner"
  | "advanced_simulator"
  | "expert_review"
  | "investment_review"
  | "insurance_review"
  | "marketplace";

export const PLAN_FEATURES: Record<Plan, Record<Feature, boolean>> = {
  free: {
    ai_chat: true, // con límite de tokens
    receipt_scanner: true, // con límite
    advanced_simulator: false,
    expert_review: false,
    investment_review: false,
    insurance_review: false,
    marketplace: false,
  },
  premium: {
    ai_chat: true,
    receipt_scanner: true,
    advanced_simulator: true,
    expert_review: true,
    investment_review: true,
    insurance_review: true,
    marketplace: true,
  },
};

export const PLAN_LABEL: Record<Plan, string> = { free: "Gratis", premium: "Premium" };

export function can(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan][feature];
}

export function isPremium(plan: Plan): boolean {
  return plan === "premium";
}

/**
 * Límite de personas en el hogar por plan (TOTAL, incluido el titular). Es una
 * tabla para que sumar un tier futuro sea una línea. El "usado" cuenta miembros
 * ACTIVOS + invitaciones PENDIENTES (si no, se invita de más y al aceptar se pasa).
 */
export const HOUSEHOLD_MEMBER_LIMITS: Record<Plan, number> = {
  free: 2,
  premium: 3,
};

export function householdMemberLimit(plan: Plan): number {
  return HOUSEHOLD_MEMBER_LIMITS[plan];
}

export function aiTokenLimit(plan: Plan): number {
  return PLAN_TOKEN_LIMITS[plan];
}

/** Beneficios mostrados en la página de plan (para el upsell). */
export const PREMIUM_BENEFITS: string[] = [
  "Conversaciones ilimitadas con My Agent C+ (límite muy amplio)",
  "Simulador avanzado de escenarios",
  "Revisión experta de inversiones y seguros",
  "Acompañamiento patrimonial personalizado",
  "Acceso anticipado al marketplace curado",
];
