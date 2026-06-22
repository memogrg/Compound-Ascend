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
