import "server-only";

/**
 * Snapshots del perfil (Palanca 4): captura diaria idempotente de las métricas
 * conductuales y de estado financiero, para medir progreso en el tiempo. Todo
 * best-effort: si una fuente falla, su métrica simplemente no aparece.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import { buildDiagnosis } from "@/modules/personal-profile/engine/diagnosis";
import { getFinancialState } from "@/modules/personal-profile/services/financial-state";
import type { ProfileDraft } from "@/modules/personal-profile/types";
import type { ProfileSnapshotRow } from "@/lib/supabase/database.types";

export type ProfileSnapshotMetrics = {
  completion?: number;
  riskClass?: string;
  archetypePrimary?: string;
  discipline?: number;
  impulsivity?: number;
  perceivedControl?: number;
  knowledgeLevel?: string;
  hasBase?: boolean;
  hasEmergencyFund?: boolean;
  hasGoals?: boolean;
  hasInvestments?: boolean;
  netWorth?: number;
};

/** Captura (o reescribe) la foto del día. Idempotente por (user_id, captured_on). */
export async function captureProfileSnapshot(draft: ProfileDraft): Promise<void> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();

    const diag = buildDiagnosis(draft);
    const metrics: ProfileSnapshotMetrics = {
      completion: diag.completion,
      riskClass: diag.riskClass,
      archetypePrimary: diag.archetypePrimary,
      discipline: draft.discipline,
      impulsivity: draft.impulsivity,
      perceivedControl: draft.perceivedControl,
      knowledgeLevel: draft.knowledgeLevel,
    };

    try {
      const state = await getFinancialState(draft);
      metrics.hasBase = state.hasBase;
      metrics.hasEmergencyFund = state.hasEmergencyFund;
      metrics.hasGoals = state.hasGoals;
      metrics.hasInvestments = state.hasInvestments;
    } catch {
      // Sin estado financiero: esas métricas quedan fuera.
    }

    // Patrimonio neto: lectura cara, en su propio try/catch (opcional).
    try {
      const { getRichLifeSummary } = await import(
        "@/modules/rich-life/services/rich-life-service"
      );
      const rich = await getRichLifeSummary();
      metrics.netWorth = rich.snapshot.indicators.netWorth;
    } catch {
      // Sin Rich Life: sin netWorth en la foto.
    }

    const household_id = await getActiveHouseholdId(supabase, user.id);
    await supabase
      .from("profile_snapshots")
      .upsert(
        { user_id: user.id, household_id, captured_on: todayIso(), metrics },
        { onConflict: "user_id,captured_on" },
      );
  } catch {
    // La captura nunca rompe la página que la dispara.
  }
}

/** Lee las fotos recientes (más nueva primero). */
export async function getProfileSnapshots(
  limit = 30,
): Promise<{ capturedOn: string; metrics: ProfileSnapshotMetrics }[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profile_snapshots")
    .select("captured_on, metrics")
    .eq("user_id", user.id)
    .order("captured_on", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: Pick<ProfileSnapshotRow, "captured_on" | "metrics">) => ({
    capturedOn: r.captured_on,
    metrics: (r.metrics ?? {}) as ProfileSnapshotMetrics,
  }));
}

/** Fecha de hoy en formato YYYY-MM-DD (UTC), para la clave diaria del upsert. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
