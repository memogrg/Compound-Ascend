import "server-only";

/**
 * Contabilidad de consumo de IA SERVER-SIDE (anti-abuso). El usuario no puede
 * modificar su consumo ni sus límites: se escribe con service-role (omite RLS) y
 * el ledger es solo-lectura para el usuario (ver migración 0008 + tests RLS).
 *
 * Límite mensual de tokens por plan. Al superarlo, se bloquea con un mensaje de
 * upgrade (monetización ética: primero valor, luego oferta).
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { PLAN_TOKEN_LIMITS, isWithinLimit } from "@/lib/ai/limits";

export { PLAN_TOKEN_LIMITS, isWithinLimit };

function currentPeriod(): string {
  // Primer día del mes en UTC (YYYY-MM-01).
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Verifica el límite ANTES de llamar a la IA. Lanza RATE_LIMITED si se superó.
 * Si Supabase/service-role no están disponibles, no bloquea (solo rate-limit por IP aplica).
 */
export async function assertTokenBudget(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = createServiceRoleClient();
    const [{ data: profile }, { data: usage }] = await Promise.all([
      supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      supabase
        .from("ai_usage_ledger")
        .select("tokens_used")
        .eq("user_id", userId)
        .eq("period", currentPeriod())
        .maybeSingle(),
    ]);
    const plan = (profile?.plan ?? "free") as "free" | "premium";
    const used = Number(usage?.tokens_used ?? 0);
    if (!isWithinLimit(plan, used)) {
      throw new AppError(
        "RATE_LIMITED",
        plan === "free"
          ? "Alcanzaste el límite de IA de tu plan gratuito este mes. Mejora a Premium para seguir conversando."
          : "Alcanzaste el límite de IA de este mes.",
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Si falla la verificación (config), no bloqueamos al usuario.
    logger.warn("assertTokenBudget no disponible", {
      message: err instanceof Error ? err.message : "?",
    });
  }
}

/** Registra el consumo DESPUÉS de la llamada (incremento server-side). */
export async function recordUsage(
  userId: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const total = Math.max(0, Math.round(tokensIn + tokensOut));
  if (total === 0) return;
  try {
    const supabase = createServiceRoleClient();
    const period = currentPeriod();
    const { data: existing } = await supabase
      .from("ai_usage_ledger")
      .select("tokens_used,requests")
      .eq("user_id", userId)
      .eq("period", period)
      .maybeSingle();

    await supabase.from("ai_usage_ledger").upsert(
      {
        user_id: userId,
        period,
        tokens_used: Number(existing?.tokens_used ?? 0) + total,
        requests: Number(existing?.requests ?? 0) + 1,
      },
      { onConflict: "user_id,period" },
    );
  } catch (err) {
    logger.warn("recordUsage fallido", { message: err instanceof Error ? err.message : "?" });
  }
}
