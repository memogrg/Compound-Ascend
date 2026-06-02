import "server-only";

/**
 * Servicio de datos del Módulo 1. Toda escritura respeta RLS (cliente con sesión).
 *
 * - `saveDraft`: guardado progresivo (jsonb `extra.draft`) — barato e idempotente.
 * - `completeProfile`: materializa el borrador en las tablas normalizadas y marca
 *   el onboarding como completo.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { computeCompletion, computeRiskClass } from "@/modules/personal-profile/engine/diagnosis";

/** Lee el borrador guardado (si existe). */
export async function getDraft(): Promise<ProfileDraft> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("personal_profiles")
    .select("extra")
    .eq("user_id", user.id)
    .maybeSingle();
  const extra = (data?.extra ?? {}) as { draft?: ProfileDraft };
  return extra.draft ?? {};
}

/** Guardado progresivo del borrador en personal_profiles.extra.draft. */
export async function saveDraft(draft: ProfileDraft): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("personal_profiles").upsert(
    {
      user_id: user.id,
      extra: { draft, updatedAt: new Date().toISOString() },
    },
    { onConflict: "user_id" },
  );
}

/**
 * Materializa el borrador en las tablas normalizadas y marca onboarding completo.
 * Devuelve el % de completitud y la clase de riesgo calculados.
 */
export async function completeProfile(
  draft: ProfileDraft,
): Promise<Pick<ProfileDiagnosis, "completion" | "riskClass">> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const completion = computeCompletion(draft);
  const riskClass = computeRiskClass(draft);

  // 1) personal_profiles (columnas normalizadas + extra).
  await supabase.from("personal_profiles").upsert(
    {
      user_id: user.id,
      age: draft.age ?? null,
      country: draft.country ?? null,
      financial_nucleus: draft.financialNucleus ?? null,
      dependents_count: draft.dependentsCount ?? 0,
      life_stage: draft.lifeStage ?? null,
      perceived_control: draft.perceivedControl ?? null,
      satisfaction: draft.satisfaction ?? null,
      urgency: draft.urgency ?? null,
      main_concern: draft.mainConcern ?? null,
      marital_status: draft.maritalStatus ?? null,
      extra: { draft, richLifeVision: draft.richLifeVision ?? null },
    },
    { onConflict: "user_id" },
  );

  // 2) risk_profiles
  await supabase.from("risk_profiles").upsert(
    {
      user_id: user.id,
      loss_reaction: draft.lossReaction ?? null,
      preference: draft.riskPreference ?? null,
      horizon: draft.investHorizon ?? null,
      has_invested: draft.hasInvested ?? null,
      volatility_comfort: draft.volatilityComfort ?? null,
      risk_class: riskClass,
    },
    { onConflict: "user_id" },
  );

  // 3) behavior_profiles
  await supabase.from("behavior_profiles").upsert(
    {
      user_id: user.id,
      discipline: draft.discipline ?? null,
      impulsivity: draft.impulsivity ?? null,
      consistency: draft.consistency ?? null,
      review_habit: draft.reviewHabit ?? null,
      hardest: draft.hardest ?? [],
    },
    { onConflict: "user_id" },
  );

  // 4) knowledge_profiles
  await supabase.from("knowledge_profiles").upsert(
    {
      user_id: user.id,
      level: draft.knowledgeLevel ?? null,
      topics_known: draft.topicsKnown ?? [],
      topics_to_learn: draft.topicsToLearn ?? [],
    },
    { onConflict: "user_id" },
  );

  // 5) prioridades (reemplazo completo)
  await supabase.from("user_priorities").delete().eq("user_id", user.id);
  if (draft.priorities?.length) {
    await supabase.from("user_priorities").insert(
      draft.priorities.map((p, i) => ({
        user_id: user.id,
        priority: p,
        kind: "prioriza" as const,
        rank: i + 1,
      })),
    );
  }

  // 6) objetivos del perfil (reemplazo)
  await supabase.from("financial_goals_profile").delete().eq("user_id", user.id);
  if (draft.goalDetails?.length) {
    await supabase.from("financial_goals_profile").insert(
      draft.goalDetails.map((g) => ({
        user_id: user.id,
        name: g.name,
        target_amount: g.targetAmount ?? null,
        target_date: g.targetDate ?? null,
        priority: g.priority ?? null,
        currency: draft.primaryCurrency ?? "CRC",
      })),
    );
  }

  // 7) user_settings (moneda + acompañamiento)
  await supabase.from("user_settings").upsert(
    {
      user_id: user.id,
      primary_currency: draft.primaryCurrency ?? "CRC",
      coaching_tone: draft.coachingTone ?? null,
      coaching_frequency: draft.coachingFrequency ?? null,
      alert_intensity: draft.alertIntensity ?? null,
    },
    { onConflict: "user_id" },
  );

  // 8) profiles (nombre + completitud + onboarding)
  await supabase
    .from("profiles")
    .update({
      display_name: draft.displayName ?? undefined,
      onboarding_completed: true,
      profile_completion: completion,
    })
    .eq("id", user.id);

  return { completion, riskClass };
}
