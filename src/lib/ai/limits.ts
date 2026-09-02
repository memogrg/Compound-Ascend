/**
 * Límites de uso de My Agent C+ por plan (módulo puro, testeable, sin
 * server-only).
 *
 * Se miden en tokens porque es lo que consume el modelo, pero ESA PALABRA NO
 * SALE NUNCA a la interfaz: al cliente le importa cuánto puede usar su asesor,
 * no cuántos tokens gasta. Lo que se le muestra vive en `AGENT_LEVEL`
 * (@/lib/plan) como nivel de acompañamiento.
 *
 * `ninguno` no es un tier gratuito: es una cuenta sin suscripción, y el chat le
 * está cerrado por `PLAN_FEATURES`. El cero de acá es el cinturón de seguridad
 * por si alguna ruta se saltara ese gate.
 */

export const PLAN_TOKEN_LIMITS = {
  ninguno: 0,
  esencial: 400_000,
  pro: 1_500_000,
  max: 4_000_000,
} as const;

export type PlanConLimite = keyof typeof PLAN_TOKEN_LIMITS;

export function isWithinLimit(plan: PlanConLimite, tokensUsed: number): boolean {
  return tokensUsed < PLAN_TOKEN_LIMITS[plan];
}
