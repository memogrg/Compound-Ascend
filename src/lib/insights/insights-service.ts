import "server-only";

/**
 * Servicio de la memoria conductual (insights). Respeta RLS (cliente de sesión).
 * Los detectores (4b+) producen DetectedInsight[] y llaman a syncInsights; aquí
 * solo vive la persistencia, la lectura priorizada y la guardia de frescura.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import { logger } from "@/lib/logger";
import { runDetectors, detectDisfruteSpike } from "@/lib/insights/detectors";
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

/**
 * Orquestador on-demand: si la última corrida está vieja, recalcula los insights
 * a partir de los datos de control y los sincroniza. Best-effort: nunca rompe.
 */
export async function refreshInsights(): Promise<void> {
  try {
    const last = await getInsightsFreshness();
    if (!isStale(last)) return; // guardia de frescura
    // Import dinámico para no acoplar lib/insights con el módulo control.
    const { listGoals, listDebts } = await import(
      "@/modules/control/services/control-service"
    );
    const [goals, debts] = await Promise.all([listGoals(), listDebts()]);
    const detected = runDetectors({ goals, debts });
    const spend = await getDisfruteSpend();
    if (spend) detected.push(...detectDisfruteSpike(spend));
    await syncInsights(detected);
  } catch (err) {
    logger.warn("refreshInsights fallido", { message: err instanceof Error ? err.message : "?" });
  }
}

/**
 * Gasto del "frasco de jugar" (categoría 'disfrute' + descendientes): total del
 * mes actual vs promedio de los 3 meses previos. null si no hay categoría disfrute.
 */
async function getDisfruteSpend(): Promise<{
  current: number;
  priorAvg: number;
  categoryId: string;
} | null> {
  const { listCategories } = await import(
    "@/modules/financial-base/services/categories-service"
  );
  const { listTransactions } = await import(
    "@/modules/financial-base/services/transaction-service"
  );
  const { monthPeriod, previousMonthPeriod } = await import(
    "@/modules/financial-base/engine/period"
  );

  const cats = await listCategories();
  const root = cats.find((c) => c.key === "disfrute");
  if (!root) return null;

  // IDs del frasco de jugar: la categoría disfrute + todos sus descendientes.
  const ids = new Set<string>([root.id]);
  let added = true;
  while (added) {
    added = false;
    for (const c of cats) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }

  const sumFor = async (period: ReturnType<typeof monthPeriod>): Promise<number> => {
    const txns = await listTransactions(period, { kind: "gasto" });
    return txns
      .filter((t) => t.categoryId && ids.has(t.categoryId))
      .reduce((acc, t) => acc + t.amount, 0);
  };

  const now = new Date();
  const cur = monthPeriod(now.getFullYear(), now.getMonth() + 1);
  const p1 = previousMonthPeriod(cur);
  const p2 = previousMonthPeriod(p1);
  const p3 = previousMonthPeriod(p2);

  const [current, s1, s2, s3] = await Promise.all([
    sumFor(cur),
    sumFor(p1),
    sumFor(p2),
    sumFor(p3),
  ]);
  return { current, priorAvg: (s1 + s2 + s3) / 3, categoryId: root.id };
}

/** Insights activos, priorizados por severidad y luego por recencia. */
export async function getActiveInsights(limit = 5): Promise<Insight[]> {
  // Auto-activación: cualquier lectura refresca si está viejo (best-effort).
  await refreshInsights();
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
