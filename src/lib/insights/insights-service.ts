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
import { runDetectors, detectDisfruteSpike, detectOpenContributions } from "@/lib/insights/detectors";
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
 * Espejo de daily-insight.RITUAL_KIND (evita un import estático del barrel de
 * wealth —que arrastra componentes— en esta capa). El ritual se gestiona en su
 * propia función (related_id null), por eso syncInsights NO debe resolverlo.
 */
const RITUAL_KIND = "ritual_patrimonio";

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
    try {
      const { listOpenContributions } = await import(
        "@/modules/wealth/services/contribution-service"
      );
      const contribs = await listOpenContributions();
      detected.push(...detectOpenContributions(contribs));
    } catch {
      // best-effort: si falla, no bloquea el resto de los insights.
    }
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

/**
 * Ritual diario patrimonial: genera (in-app, on-demand) UN insight del día con
 * el Marco Patrimonial y lo deja activo en user_insights para "Qué noté". Reusa
 * getPatrimonioReport por sesión; guardia diaria; uno activo a la vez. Best-effort.
 */
export async function refreshDailyPatrimonioInsight(): Promise<void> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();

    // Guardia diaria: si ya se generó un ritual fresco (<20 h), no regenerar.
    // Sin filtrar por status: un ritual descartado también cuenta como "el del
    // día" — si la guardia solo mirara activos, descartarlo la vaciaría y el
    // ritual renacería en la misma lectura (imposible cerrarlo).
    const { data: last } = await supabase
      .from("user_insights")
      .select("updated_at")
      .eq("user_id", user.id)
      .eq("kind", RITUAL_KIND)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!isStale(last?.updated_at ? new Date(last.updated_at) : null, 20)) return;

    const { getPatrimonioReport, buildDailyPatrimonioInsight } = await import("@/modules/wealth");
    const { report, level, diagnosis } = await getPatrimonioReport();
    const detected = buildDailyPatrimonioInsight(report, level, diagnosis);
    const household_id = await getActiveHouseholdId(supabase, user.id);

    // Uno activo a la vez: como related_id es null, el upsert no dedupea; cerramos
    // el ritual previo y luego insertamos el nuevo.
    await supabase
      .from("user_insights")
      .update({ status: "resuelto" })
      .eq("user_id", user.id)
      .eq("kind", RITUAL_KIND)
      .eq("status", "activo");
    await supabase.from("user_insights").insert({
      user_id: user.id,
      household_id,
      kind: detected.kind,
      severity: detected.severity,
      title: detected.title,
      body: detected.body,
      metric: detected.metric ?? null,
      related_kind: detected.relatedKind ?? null,
      related_id: detected.relatedId ?? null,
      status: "activo" as const,
    });
  } catch (err) {
    logger.warn("refreshDailyPatrimonioInsight fallido", {
      message: err instanceof Error ? err.message : "?",
    });
  }
}

/**
 * Escritura del ritual SIN sesión (cron/push): mismo efecto que la versión 5a
 * pero con cliente service-role. Resuelve household_id por userId, cierra el
 * ritual activo previo e inserta el nuevo. Filtra SIEMPRE por userId explícito.
 */
export async function writeDailyInsightForUserCron(
  userId: string,
  detected: DetectedInsight,
): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const household_id = await getActiveHouseholdId(admin, userId);

  // Uno activo a la vez (related_id null no dedupea en upsert): cerrar el previo,
  // luego insertar el nuevo.
  await admin
    .from("user_insights")
    .update({ status: "resuelto" })
    .eq("user_id", userId)
    .eq("kind", RITUAL_KIND)
    .eq("status", "activo");
  await admin.from("user_insights").insert({
    user_id: userId,
    household_id,
    kind: detected.kind,
    severity: detected.severity,
    title: detected.title,
    body: detected.body,
    metric: detected.metric ?? null,
    related_kind: detected.relatedKind ?? null,
    related_id: detected.relatedId ?? null,
    status: "activo" as const,
  });
}

/**
 * Genera y persiste el ritual del día para UN usuario (service-role): corre el
 * reporte patrimonial sin sesión, construye el insight y lo escribe. Lanza si
 * algo falla (el orquestador lo trata best-effort).
 */
export async function generateDailyRitualForUser(userId: string): Promise<void> {
  const { getPatrimonioReportForUser, buildDailyPatrimonioInsight } = await import(
    "@/modules/wealth"
  );
  const { report, level, diagnosis } = await getPatrimonioReportForUser(userId);
  const detected = buildDailyPatrimonioInsight(report, level, diagnosis);
  await writeDailyInsightForUserCron(userId, detected);
}

/**
 * Itera usuarios best-effort: si uno falla, loguea y sigue con los demás.
 * Puro/testeable (la función por-usuario se inyecta). Devuelve conteos.
 */
export async function runForUsersBestEffort(
  userIds: string[],
  fn: (userId: string) => Promise<void>,
): Promise<{ total: number; ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      await fn(userId);
      ok += 1;
    } catch (err) {
      failed += 1;
      logger.warn("ritual cron: usuario falló", {
        userId,
        message: err instanceof Error ? err.message : "?",
      });
    }
  }
  return { total: userIds.length, ok, failed };
}

/** Genera el ritual del día para TODOS los usuarios (Vercel Cron). Best-effort. */
export async function generateDailyRitualForAllUsers(): Promise<{
  total: number;
  ok: number;
  failed: number;
}> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data: users } = await admin.from("profiles").select("id");
  const ids = (users ?? []).map((u) => u.id);
  return runForUsersBestEffort(ids, generateDailyRitualForUser);
}

/** Insights activos, priorizados por severidad y luego por recencia. */
export async function getActiveInsights(limit = 5): Promise<Insight[]> {
  // Auto-activación: cualquier lectura refresca si está viejo (best-effort).
  await refreshInsights();
  await refreshDailyPatrimonioInsight();
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
    // El upsert fija status 'activo': si incluyera keys descartadas las
    // reviviría. Un descarte persiste hasta que el usuario lo revierte con
    // "Recordar acciones" (restoreDismissedInsights).
    const { data: dismissed } = await supabase
      .from("user_insights")
      .select("kind, related_id")
      .eq("user_id", user.id)
      .eq("status", "descartado");
    const dismissedKeys = new Set((dismissed ?? []).map((d) => keyOf(d.kind, d.related_id)));
    const rows = detected
      .filter((d) => !dismissedKeys.has(keyOf(d.kind, d.relatedId)))
      .map((d) => ({
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
    if (rows.length > 0) {
      await supabase.from("user_insights").upsert(rows, { onConflict: "user_id,kind,related_id" });
    }
  }

  // Cierra los activos que ya no detecta ninguna pasada (se consideran resueltos).
  const { data: actives } = await supabase
    .from("user_insights")
    .select("id, kind, related_id")
    .eq("user_id", user.id)
    .eq("status", "activo");
  const present = new Set(detected.map((d) => keyOf(d.kind, d.relatedId)));
  const toResolve = (actives ?? [])
    // El ritual patrimonial se gestiona aparte; no lo resuelve esta pasada.
    .filter((a) => a.kind !== RITUAL_KIND && !present.has(keyOf(a.kind, a.related_id)))
    .map((a) => a.id);
  if (toResolve.length > 0) {
    await supabase.from("user_insights").update({ status: "resuelto" }).in("id", toResolve);
  }
}

/** Descarta un insight (lo oculta sin marcarlo resuelto). Para la 4d. */
export async function dismissInsight(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("user_insights")
    .update({ status: "descartado" })
    .eq("id", id)
    .eq("user_id", user.id);
}

/**
 * Restaura los insights descartados ("Recordar acciones" de la campana).
 * Conserva el invariante de UN ritual activo a la vez: si al restaurar
 * coexisten varios, deja solo el más reciente y resuelve los demás. Los
 * insights cuya condición ya no aplica se auto-limpian en la siguiente
 * pasada de detectores (syncInsights los marca 'resuelto').
 */
export async function restoreDismissedInsights(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("user_insights")
    .update({ status: "activo" })
    .eq("user_id", user.id)
    .eq("status", "descartado");

  const { data: rituals } = await supabase
    .from("user_insights")
    .select("id")
    .eq("user_id", user.id)
    .eq("kind", RITUAL_KIND)
    .eq("status", "activo")
    .order("updated_at", { ascending: false });
  const extra = (rituals ?? []).slice(1).map((r) => r.id);
  if (extra.length > 0) {
    await supabase.from("user_insights").update({ status: "resuelto" }).in("id", extra);
  }
}

/** Puro y testeable: ¿la última corrida está vieja (o no existe)? */
export function isStale(last: Date | null, maxAgeHours = 12): boolean {
  if (!last) return true;
  return Date.now() - last.getTime() > maxAgeHours * 60 * 60 * 1000;
}
