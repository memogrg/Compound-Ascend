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
import type { HouseholdRole } from "@/lib/supabase/database.types";
import type { ProfileDraft, ProfileDiagnosis } from "@/modules/personal-profile/types";
import { computeCompletion, computeRiskClass } from "@/modules/personal-profile/engine/diagnosis";
import { computeArchetype } from "@/modules/personal-profile/engine/archetype-engine";

export type HouseholdContext = { role: HouseholdRole | null; isInvitedMember: boolean };

/**
 * Rol del usuario en su hogar. `isInvitedMember` es true cuando pertenece a un
 * hogar pero NO es owner de ninguno: es un invitado que hereda el perfil del
 * hogar y no debe correr el wizard.
 */
export async function getHouseholdContext(): Promise<HouseholdContext> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("household_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const roles = (data ?? []).map((r) => r.role);
  if (roles.length === 0) return { role: null, isInvitedMember: false };
  const isOwner = roles.includes("owner");
  return { role: isOwner ? "owner" : (roles[0] ?? null), isInvitedMember: !isOwner };
}

/** Perfil (solo lectura) del owner del hogar al que pertenece el invitado. */
export async function getHouseholdProfileDraft(): Promise<ProfileDraft> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_household_profile", {});
  const extra = (data ?? {}) as { draft?: ProfileDraft };
  return extra.draft ?? {};
}

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
): Promise<
  Pick<
    ProfileDiagnosis,
    | "completion"
    | "riskClass"
    | "archetypePrimary"
    | "archetypeSecondary"
    | "dominantEmotion"
    | "recommendedTone"
    | "initialFocus"
    | "moneyScript"
  >
> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const completion = computeCompletion(draft);
  const riskClass = computeRiskClass(draft);
  const arche = computeArchetype(draft);

  // 1) personal_profiles (columnas normalizadas + arquetipo + extra).
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
      main_concern: draft.mainConcerns?.[0] ?? draft.mainConcern ?? null,
      marital_status: draft.maritalStatus ?? null,
      archetype_primary: arche.primary,
      archetype_secondary: arche.secondary,
      dominant_emotion: arche.dominantEmotion,
      ai_tone_recommended: arche.recommendedTone,
      money_script: arche.moneyScript,
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

  // 9) user_metadata.display_name (coherencia: lo leen account/dashboard como
  // respaldo y otros clientes de auth). Best-effort: no bloquea el onboarding.
  if (draft.displayName) {
    await supabase.auth.updateUser({ data: { display_name: draft.displayName } });
  }

  return {
    completion,
    riskClass,
    archetypePrimary: arche.primary,
    archetypeSecondary: arche.secondary,
    dominantEmotion: arche.dominantEmotion,
    recommendedTone: arche.recommendedTone,
    initialFocus: arche.initialFocus,
    moneyScript: arche.moneyScript ?? undefined,
  };
}
