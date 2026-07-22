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

/** Restaura los insights descartados ("Recordar acciones" de la campana). */
export async function restoreInsightsAction(): Promise<void> {
  const { restoreDismissedInsights } = await import("@/lib/insights");
  await restoreDismissedInsights();
  revalidatePath("/dashboard");
}

export type BellInsight = {
  id: string;
  /** Tipo de insight — permite el deep-link por tipo cuando no hay entidad relacionada. */
  kind: string;
  severity: string;
  title: string;
  body: string;
  // Entidad relacionada (aditivo): permite el deep-link de la campana móvil. La
  // campana web solo lee id/severity/title/body, así que ignora estos campos.
  relatedKind?: string;
  relatedId?: string | null;
};
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
        kind: i.kind,
        severity: i.severity,
        title: i.title,
        body: i.body,
        relatedKind: i.relatedKind,
        relatedId: i.relatedId,
      })),
    };
  } catch {
    return { inApp: true, insights: [] };
  }
}
