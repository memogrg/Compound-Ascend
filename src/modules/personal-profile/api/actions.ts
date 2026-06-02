"use server";

/**
 * Server Actions del Setup Wizard (Módulo 1).
 * Validan con Zod y persisten respetando RLS. Si Supabase aún no está
 * configurado (dev), no persisten pero devuelven el diagnóstico calculado para
 * no bloquear la experiencia.
 */
import { profileDraftSchema } from "@/modules/personal-profile/schemas";
import { saveDraft, completeProfile } from "@/modules/personal-profile/services/profile-service";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { isSupabaseConfigured } from "@/lib/auth/session";
import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { logger } from "@/lib/logger";

export type SaveResult = { ok: boolean };
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
