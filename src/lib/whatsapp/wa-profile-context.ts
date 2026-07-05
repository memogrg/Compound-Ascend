import "server-only";

/**
 * Lecturas de perfil (baratas) para enriquecer el FinancialContext SIN sesión.
 * Toma un cliente Supabase + userId explícito → funciona igual con service-role
 * (webhook de WhatsApp) que con el de sesión. Filtra SIEMPRE por `userId`.
 *
 * Espeja el subconjunto de perfil que arma `context-engine.ts` (web) para las
 * lecturas más valiosas y baratas: preocupación, etapa, arquetipo + tono, emoción,
 * riesgo, disciplina/impulsividad, preferencias de coaching y prioridades. Cada
 * bloque es best-effort: un fallo aislado no degrada el resto ni rompe el contexto.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { FinancialContext } from "@/lib/ai/orchestrator";
import { ARCHETYPE_PLAYBOOKS } from "@/lib/ai/advisor-knowledge";

type Db = SupabaseClient<Database>;

/** Coacciona un valor jsonb a string[] (las columnas jsonb llegan como unknown). */
function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function readProfileContext(db: Db, userId: string): Promise<Partial<FinancialContext>> {
  const ctx: Partial<FinancialContext> = {};

  // Lecturas agrupadas (una fila por tabla): perfil, riesgo, conducta, settings, prioridades.
  const [ppRes, riskRes, behRes, setRes, prioRes] = await Promise.all([
    db
      .from("personal_profiles")
      .select(
        "main_concern,life_stage,archetype_primary,archetype_secondary,dominant_emotion,ai_tone_recommended,money_script",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("risk_profiles")
      .select("risk_class,loss_reaction,preference,horizon,volatility_comfort,has_invested")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("behavior_profiles")
      .select("discipline,impulsivity,review_habit,hardest")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("user_settings")
      .select("coaching_tone,coaching_frequency,alert_intensity")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("user_priorities")
      .select("priority,rank")
      .eq("user_id", userId)
      .eq("kind", "prioriza")
      .order("rank", { ascending: true, nullsFirst: false })
      .limit(3),
  ]);

  // Perfil: preocupación, etapa, arquetipo + tono recomendado, emoción, money script.
  const pp = ppRes.data;
  if (pp?.main_concern) ctx.topConcern = String(pp.main_concern).replaceAll("_", " ");
  if (pp?.life_stage) ctx.lifeStage = String(pp.life_stage).replaceAll("_", " ");
  if (pp?.money_script) ctx.moneyScript = pp.money_script;
  if (pp?.dominant_emotion) ctx.dominantEmotion = pp.dominant_emotion;
  if (pp?.archetype_primary) {
    const primary = pp.archetype_primary as keyof typeof ARCHETYPE_PLAYBOOKS;
    const play = ARCHETYPE_PLAYBOOKS[primary];
    if (play) {
      ctx.archetypePrimary = primary;
      ctx.archetypeLabel = play.label;
      ctx.archetypeGuidance = play.guidance;
      ctx.initialFocus = play.initialFocus;
      ctx.recommendedTone = pp.ai_tone_recommended ?? play.recommendedTone;
    }
    if (pp.archetype_secondary) {
      const secondary = pp.archetype_secondary as keyof typeof ARCHETYPE_PLAYBOOKS;
      const play2 = ARCHETYPE_PLAYBOOKS[secondary];
      if (play2) {
        ctx.archetypeSecondary = secondary;
        ctx.archetypeLabel2 = play2.label;
      }
    }
  }

  // Riesgo.
  const risk = riskRes.data;
  if (risk) {
    if (risk.risk_class) ctx.riskClass = risk.risk_class;
    if (risk.loss_reaction) ctx.lossReaction = risk.loss_reaction;
    if (risk.preference) ctx.riskPreference = risk.preference;
    if (risk.horizon) ctx.horizon = risk.horizon;
    if (risk.volatility_comfort != null) ctx.volatilityComfort = risk.volatility_comfort;
    if (risk.has_invested != null) ctx.hasInvested = risk.has_invested;
  }

  // Conducta: disciplina / impulsividad / hábito de revisión / lo más difícil.
  const beh = behRes.data;
  if (beh) {
    if (beh.discipline != null) ctx.discipline = beh.discipline;
    if (beh.impulsivity != null) ctx.impulsivity = beh.impulsivity;
    if (beh.review_habit) ctx.reviewHabit = String(beh.review_habit).replaceAll("_", " ");
    const hardest = asStrings(beh.hardest);
    if (hardest.length) ctx.hardest = hardest;
  }

  // Preferencias de coaching.
  const set = setRes.data;
  if (set) {
    if (set.coaching_tone) ctx.coachingTone = set.coaching_tone;
    if (set.coaching_frequency) ctx.coachingFrequency = set.coaching_frequency;
    if (set.alert_intensity) ctx.alertIntensity = set.alert_intensity;
  }

  // Prioridades (top 3 que el usuario prioriza, por rank).
  const priorities = (prioRes.data ?? [])
    .map((r) => r.priority)
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .map((p) => p.replaceAll("_", " "));
  if (priorities.length) ctx.priorities = priorities;

  return ctx;
}
