import "server-only";

/**
 * Servicio de la memoria conductual (insights). Respeta RLS (cliente de sesión).
 * Los detectores (4b+) producen DetectedInsight[] y llaman a syncInsights; aquí
 * solo vive la persistencia, la lectura priorizada y la guardia de frescura.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import type { UserInsightRow } from "@/lib/supabase/database.types";
import type {
  DetectedInsight,
  Insight,
  InsightKind,
  InsightRelatedKind,
  InsightSeverity,
  InsightStatus,
} from "@/lib/insights/types";

/** Prioridad de lectura: lo accionable primero, lo celebrable al final. */
const SEVERITY_RANK: Record<InsightSeverity, number> = {
  accionar: 0,
  observar: 1,
  info: 2,
  celebrar: 3,
};

function rowToInsight(r: UserInsightRow): Insight {
  return {
    kind: r.kind as InsightKind,
    severity: r.severity as InsightSeverity,
    title: r.title,
    body: r.body,
    metric: r.metric ?? undefined,
    relatedKind: (r.related_kind ?? undefined) as InsightRelatedKind | undefined,
    relatedId: r.related_id ?? undefined,
    id: r.id,
    status: r.status as InsightStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Clave de identidad de un insight (kind + entidad relacionada). */
const keyOf = (kind: string, relatedId: string | null | undefined): string =>
  `${kind}::${relatedId ?? ""}`;

/** Insights activos, priorizados por severidad y luego por recencia. */
export async function getActiveInsights(limit = 5): Promise<Insight[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_insights")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "activo");
  const rows = (data ?? []).map(rowToInsight);
  rows.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
  );
  return rows.slice(0, limit);
}

/** Última actualización de insights del usuario (guardia de frescura para 4b). */
export async function getInsightsFreshness(): Promise<Date | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_insights")
    .select("updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.updated_at ? new Date(data.updated_at) : null;
}

/**
 * Sincroniza los insights detectados: upsert por (user_id, kind, related_id) y
 * marca 'resuelto' los activos cuyo (kind, related_id) ya no aparece en `detected`.
 */
export async function syncInsights(detected: DetectedInsight[]): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);

  if (detected.length > 0) {
    const rows = detected.map((d) => ({
      user_id: user.id,
      household_id,
      kind: d.kind,
      severity: d.severity,
      title: d.title,
      body: d.body,
      metric: d.metric ?? null,
      related_kind: d.relatedKind ?? null,
      related_id: d.relatedId ?? null,
      status: "activo" as const,
    }));
    await supabase.from("user_insights").upsert(rows, { onConflict: "user_id,kind,related_id" });
  }

  // Cierra los activos que ya no detecta ninguna pasada (se consideran resueltos).
  const { data: actives } = await supabase
    .from("user_insights")
    .select("id, kind, related_id")
    .eq("user_id", user.id)
    .eq("status", "activo");
  const present = new Set(detected.map((d) => keyOf(d.kind, d.relatedId)));
  const toResolve = (actives ?? [])
    .filter((a) => !present.has(keyOf(a.kind, a.related_id)))
    .map((a) => a.id);
  if (toResolve.length > 0) {
    await supabase.from("user_insights").update({ status: "resuelto" }).in("id", toResolve);
  }
}

/** Descarta un insight (lo oculta sin marcarlo resuelto). Para la 4d. */
export async function dismissInsight(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.from("user_insights").update({ status: "descartado" }).eq("id", id);
}

/** Puro y testeable: ¿la última corrida está vieja (o no existe)? */
export function isStale(last: Date | null, maxAgeHours = 12): boolean {
  if (!last) return true;
  return Date.now() - last.getTime() > maxAgeHours * 60 * 60 * 1000;
}
