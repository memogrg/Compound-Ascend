import "server-only";
import { now as simNow } from "@/lib/time/clock";

/**
 * Servicio del cron de reinicio de frascos recurrentes. Usa SERVICE ROLE (omite
 * RLS) porque recorre las metas de todos los usuarios; SOLO se invoca desde la
 * ruta protegida con CRON_SECRET. Reinicia los frascos vencidos (recurrence !=
 * 'ninguna' y next_reset_on <= hoy): restaura target_amount a period_amount,
 * arrastra current_amount (no lo toca) y avanza next_reset_on. Idempotente.
 *
 * ── LA ZONA HORARIA ES POR USUARIO ──────────────────────────────────────────
 * Vercel corre el cron en UTC. Pero `reset_on` es un HECHO histórico (el día en que
 * reabrió el frasco) y `next_reset_on <= hoy` decide SI toca reinicio; ambos tienen
 * que leerse en el día LOCAL del dueño, no en UTC. Si no: a las 23:00 en UTC−6
 * (05:00 UTC del día siguiente) el cálculo en UTC guardaría `reset_on` con +1 día y
 * podría reiniciar un frasco un día antes de tiempo. Por eso cada usuario se resuelve
 * contra SU zona (`user_settings.timezone`, con UTC de piso) — mismo patrón que
 * `listCronUsers` en lib/rhythm/cron-service.ts.
 *
 * El filtro SQL usa un borde amplio (día UTC + 1, la zona más adelantada posible es
 * UTC+14) y el corte real —`next_reset_on <= hoyLocal`— se afina por usuario en
 * memoria: depende de la zona de cada quien y no se puede expresar en una sola query.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { computeReset, type Recurrence } from "@/modules/control/engine/recurrence";
import { isValidTimeZone, todayISOInTz } from "@/lib/time/user-time-core";
import { logger } from "@/lib/logger";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reinicia los frascos recurrentes vencidos. Devuelve cuántos reinició. */
export async function rollDueGoalPeriods(today: Date = simNow()): Promise<{ reset: number }> {
  const supabase = createServiceRoleClient();
  // Borde amplio: en la zona más adelantada (UTC+14) "hoy" puede ser el día UTC + 1.
  // Se trae hasta ahí y el corte real se afina por zona más abajo.
  const upperBoundIso = new Date(today.getTime() + DAY_MS).toISOString().slice(0, 10);

  const { data: goals, error } = await supabase
    .from("savings_goals")
    .select(
      "id,user_id,household_id,current_amount,target_amount,period_amount,recurrence,next_reset_on",
    )
    .neq("recurrence", "ninguna")
    .not("next_reset_on", "is", null)
    .lte("next_reset_on", upperBoundIso);
  if (error) throw new Error(error.message);
  if (!goals || goals.length === 0) return { reset: 0 };

  // Zona por usuario en UNA consulta (no 1 por meta). UTC de piso, igual que
  // resolveUserTz / listCronUsers: sin zona capturada el frasco se reinicia en UTC.
  const tzByUser = new Map<string, string>();
  const userIds = [...new Set(goals.map((g) => g.user_id))];
  const { data: settings } = await supabase
    .from("user_settings")
    .select("user_id, timezone")
    .in("user_id", userIds);
  for (const s of settings ?? []) {
    if (isValidTimeZone(s.timezone)) tzByUser.set(s.user_id, s.timezone);
  }

  let reset = 0;
  for (const g of goals) {
    try {
      const todayLocalIso = todayISOInTz(tzByUser.get(g.user_id) ?? "UTC", today);

      // Corte real en la zona del dueño: descarta lo que el borde UTC trajo de más
      // (p.ej. next_reset_on = mañana-UTC que todavía es hoy/futuro en su zona).
      if (g.next_reset_on! > todayLocalIso) continue;

      // period_amount es la fuente del plan; si faltara (dato viejo), cae al target.
      const periodAmount =
        g.period_amount != null ? Number(g.period_amount) : Number(g.target_amount);
      const r = computeReset({
        periodAmount,
        currentAmount: Number(g.current_amount),
        nextResetOn: g.next_reset_on!,
        recurrence: g.recurrence as Recurrence,
        todayISO: todayLocalIso,
      });

      // target vuelve al plan del período; current NO se toca (arrastre); el
      // frasco reabre su ciclo → status 'revisar' para re-evaluación.
      const { error: upErr } = await supabase
        .from("savings_goals")
        .update({
          target_amount: r.restoredTarget,
          next_reset_on: r.nextResetOn,
          status: "revisar",
        })
        .eq("id", g.id);
      if (upErr) throw new Error(upErr.message);

      // Trazabilidad (best-effort). El unique(goal_id, reset_on) lo hace
      // idempotente: si el cron corrió dos veces hoy, el 2º insert choca (23505)
      // y se ignora.
      const { error: insErr } = await supabase.from("goal_period_resets").insert({
        goal_id: g.id,
        user_id: g.user_id,
        household_id: g.household_id,
        reset_on: todayLocalIso,
        restored_target: r.restoredTarget,
        carried_over: r.carriedOver,
      });
      if (insErr && insErr.code !== "23505") {
        logger.error("goal_period_resets insert fallido", {
          goalId: g.id,
          message: insErr.message,
        });
      }

      reset += 1;
    } catch (err) {
      // Tolera fallos por meta (log y continuar), como debt-reminders.
      logger.error("reinicio de frasco fallido", {
        goalId: g.id,
        message: err instanceof Error ? err.message : "?",
      });
    }
  }

  return { reset };
}
