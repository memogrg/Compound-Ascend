/** Límites de tokens por plan (módulo puro, testeable, sin server-only). */

export const PLAN_TOKEN_LIMITS = {
  free: 60_000,
  premium: 2_000_000,
} as const;

export function isWithinLimit(plan: "free" | "premium", tokensUsed: number): boolean {
  return tokensUsed < PLAN_TOKEN_LIMITS[plan];
}
