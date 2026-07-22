import "server-only";

/**
 * Recordatorio semestral de revisión del perfil financiero (Palanca de retención).
 *
 * Cada 6 meses sin tocar el perfil, se genera un insight en la campana ("revisá tu perfil").
 * Reusa el canal de notificación existente (`user_insights`) y el patrón cron→insight de
 * `generateDailyRitualForAllUsers`. Sin tabla ni columna nuevas: la antigüedad sale de
 * `personal_profiles.updated_at` (auto-actualizado por trigger en cada guardado del perfil).
 *
 * Idempotente por el `unique (user_id, kind, related_id)` de user_insights: `related_id` es
 * la FECHA de `updated_at` (clave de ventana), y la inserción va con ON CONFLICT DO NOTHING →
 * no re-notifica ni revive un descartado dentro de la misma ventana. Cuando el usuario
 * actualiza el perfil (updated_at fresco), su reminder activo se marca `resuelto`.
 */
import { logger } from "@/lib/logger";
import { getActiveHouseholdId } from "@/lib/household/active";

export const REVIEW_INTERVAL_MONTHS = 6;
export const PROFILE_REVIEW_KIND = "perfil_revision" as const;

export const PROFILE_REVIEW_TITLE = "Revisá tu perfil financiero";
export const PROFILE_REVIEW_BODY =
  "Han pasado 6 meses: revisá tu perfil financiero por si algo cambió (ingresos, metas, familia).";

// ── Helpers puros (testables, sin IO) ──────────────────────────────

/** Fecha límite: hace `months` meses respecto a `now`. */
export function reviewCutoff(now: Date, months = REVIEW_INTERVAL_MONTHS): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

/** ¿El perfil está "viejo" (updated_at anterior al corte)? */
export function isProfileStale(updatedAtIso: string, now: Date, months = REVIEW_INTERVAL_MONTHS): boolean {
  const t = Date.parse(updatedAtIso);
  return Number.isFinite(t) && t < reviewCutoff(now, months).getTime();
}

/** Clave de ventana idempotente: la fecha (YYYY-MM-DD) de la última actualización del perfil.
 *  Estable mientras el perfil no cambie; distinta tras cada actualización → nueva ventana. */
export function reminderKey(updatedAtIso: string): string {
  return updatedAtIso.slice(0, 10);
}

/** IDs de reminders ACTIVOS cuyo usuario ya NO está en el conjunto de perfiles viejos
 *  (revisaron el perfil) → deben marcarse resueltos. Puro. */
export function selectResolvable(
  activeReminders: { id: string; userId: string }[],
  staleUserIds: ReadonlySet<string>,
): string[] {
  return activeReminders.filter((r) => !staleUserIds.has(r.userId)).map((r) => r.id);
}

// ── Orquestador (IO, service-role) ─────────────────────────────────

type StaleRow = { user_id: string; updated_at: string };

/** Corre el recordatorio para TODOS los usuarios (Vercel Cron mensual). Best-effort. */
export async function remindStaleProfiles(now: Date = new Date()): Promise<{
  stale: number;
  created: number;
  resolved: number;
}> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();

  const cutoffIso = reviewCutoff(now).toISOString();
  const { data: stale } = await admin
    .from("personal_profiles")
    .select("user_id, updated_at")
    .lt("updated_at", cutoffIso);
  const staleRows = (stale ?? []) as StaleRow[];
  const staleUserIds = new Set(staleRows.map((r) => r.user_id));

  // Inserta el reminder de los perfiles viejos. ignoreDuplicates = ON CONFLICT DO NOTHING:
  // idempotente y NO toca los existentes (respeta activos y descartados de la ventana).
  let created = 0;
  if (staleRows.length > 0) {
    const rows = await Promise.all(
      staleRows.map(async (r) => ({
        user_id: r.user_id,
        household_id: await getActiveHouseholdId(admin, r.user_id),
        kind: PROFILE_REVIEW_KIND,
        severity: "info" as const,
        title: PROFILE_REVIEW_TITLE,
        body: PROFILE_REVIEW_BODY,
        metric: null,
        related_kind: null,
        related_id: reminderKey(r.updated_at),
        status: "activo" as const,
      })),
    );
    const { data: inserted, error } = await admin
      .from("user_insights")
      .upsert(rows, { onConflict: "user_id,kind,related_id", ignoreDuplicates: true })
      .select("id");
    if (error) logger.warn("profile-review: upsert falló", { message: error.message });
    created = inserted?.length ?? 0;
  }

  // Resuelve los reminders activos de quienes ya NO están viejos (revisaron el perfil).
  const { data: actives } = await admin
    .from("user_insights")
    .select("id, user_id")
    .eq("kind", PROFILE_REVIEW_KIND)
    .eq("status", "activo");
  const toResolve = selectResolvable(
    (actives ?? []).map((a) => ({ id: a.id, userId: a.user_id })),
    staleUserIds,
  );
  let resolved = 0;
  if (toResolve.length > 0) {
    await admin.from("user_insights").update({ status: "resuelto" }).in("id", toResolve);
    resolved = toResolve.length;
  }

  return { stale: staleRows.length, created, resolved };
}

/** Genera el reminder para UN usuario (POST del cron, para pruebas). Fuerza el insight con la
 *  clave de ventana actual de su perfil (upsert normal → aparece aunque estuviera resuelto). */
export async function remindProfileForUser(userId: string): Promise<boolean> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data: profile } = await admin
    .from("personal_profiles")
    .select("updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.updated_at) return false;
  const household_id = await getActiveHouseholdId(admin, userId);
  const { error } = await admin.from("user_insights").upsert(
    {
      user_id: userId,
      household_id,
      kind: PROFILE_REVIEW_KIND,
      severity: "info" as const,
      title: PROFILE_REVIEW_TITLE,
      body: PROFILE_REVIEW_BODY,
      metric: null,
      related_kind: null,
      related_id: reminderKey(profile.updated_at),
      status: "activo" as const,
    },
    { onConflict: "user_id,kind,related_id" },
  );
  if (error) {
    logger.warn("profile-review (single): upsert falló", { message: error.message });
    return false;
  }
  return true;
}
