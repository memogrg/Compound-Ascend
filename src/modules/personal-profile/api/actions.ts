"use server";

/**
 * Server Actions del Setup Wizard (Módulo 1).
 * Validan con Zod y persisten respetando RLS. Si Supabase aún no está
 * configurado (dev), no persisten pero devuelven el diagnóstico calculado para
 * no bloquear la experiencia.
 */
import { revalidatePath } from "next/cache";
import { profileDraftSchema } from "@/modules/personal-profile/schemas";
import { saveDraft, completeProfile } from "@/modules/personal-profile/services/profile-service";
import {
  seedDemoTemplate,
  markOnboardingStarted,
} from "@/modules/personal-profile/services/demo-template";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { isSupabaseConfigured } from "@/lib/auth/session";
import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { logger } from "@/lib/logger";

export type SaveResult = { ok: boolean };
export type StartResult = { ok: boolean; message?: string };

/** Opción "Crear ejemplo y editarlo": siembra la plantilla demo del usuario. */
export async function startWithDemoAction(): Promise<StartResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Conecta Supabase para usar la plantilla de ejemplo." };
  }
  try {
    await seedDemoTemplate();
    revalidatePath("/dashboard");
    revalidatePath("/mi-base-financiera");
    revalidatePath("/control-financiero");
    revalidatePath("/patrimonio");
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("startWithDemo fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos crear el ejemplo. Inténtalo de nuevo." };
  }
}

/** Opción "Quiero cargarlo manualmente": marca el onboarding y va al panel. */
export async function startManualAction(): Promise<StartResult> {
  if (!isSupabaseConfigured()) return { ok: true };
  try {
    await markOnboardingStarted();
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: true }; // no bloqueamos la navegación
  }
}
export type CompleteResult = { ok: boolean; diagnosis: ProfileDiagnosis; persisted: boolean };

/** Guardado progresivo (best-effort). */
export async function saveDraftAction(draft: ProfileDraft): Promise<SaveResult> {
  const parsed = profileDraftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false };
  if (!isSupabaseConfigured()) return { ok: true };
  try {
    await saveDraft(parsed.data as ProfileDraft);
    return { ok: true };
  } catch (err) {
    logger.warn("saveDraft fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false };
  }
}

/** Completa el onboarding: materializa el perfil y devuelve el diagnóstico. */
export async function completeOnboardingAction(draft: ProfileDraft): Promise<CompleteResult> {
  const parsed = profileDraftSchema.safeParse(draft);
  const safe = (parsed.success ? parsed.data : draft) as ProfileDraft;
  const diagnosis = buildDiagnosis(safe);

  if (!isSupabaseConfigured()) {
    return { ok: true, diagnosis, persisted: false };
  }

  try {
    const { completion, riskClass } = await completeProfile(safe);
    return {
      ok: true,
      diagnosis: { ...diagnosis, completion, riskClass },
      persisted: true,
    };
  } catch (err) {
    logger.error("completeOnboarding fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, diagnosis, persisted: false };
  }
}
