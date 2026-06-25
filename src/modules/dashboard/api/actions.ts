"use server";

/**
 * Server Actions del dashboard. Por ahora solo: descartar una observación
 * conductual (memoria conductual, Fase 4d). RLS garantiza que solo afecte
 * filas del propio usuario/hogar.
 */
import { revalidatePath } from "next/cache";

export async function dismissInsightAction(id: string): Promise<void> {
  const { dismissInsight } = await import("@/lib/insights");
  await dismissInsight(id);
  revalidatePath("/dashboard");
}

export type BellInsight = { id: string; severity: string; title: string; body: string };
export type BellData = { inApp: boolean; insights: BellInsight[] };

/**
 * Insights activos para la campana (mismos que "Qué noté"). Respeta la pref
 * `inApp`: si está OFF → sin lista. Best-effort: si falla, devuelve vacío.
 */
export async function listActiveInsightsAction(): Promise<BellData> {
  try {
    const { isSupabaseConfigured, getUser } = await import("@/lib/auth/session");
    const user = isSupabaseConfigured() ? await getUser() : null;
    if (!user) return { inApp: true, insights: [] };

    const { getNotificationPrefs } = await import("@/lib/notifications/preferences");
    const prefs = await getNotificationPrefs(user.id);
    if (!prefs.inApp) return { inApp: false, insights: [] };

    const { getActiveInsights } = await import("@/lib/insights");
    const insights = await getActiveInsights(8);
    return {
      inApp: true,
      insights: insights.map((i) => ({
        id: i.id,
        severity: i.severity,
        title: i.title,
        body: i.body,
      })),
    };
  } catch {
    return { inApp: true, insights: [] };
  }
}
