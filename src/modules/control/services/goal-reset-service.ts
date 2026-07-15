import "server-only";

/**
 * Servicio del cron de reinicio de frascos recurrentes. Usa SERVICE ROLE (omite
 * RLS) porque recorre las metas de todos los usuarios; SOLO se invoca desde la
 * ruta protegida con CRON_SECRET. Reinicia los frascos vencidos (recurrence !=
 * 'ninguna' y next_reset_on <= hoy): restaura target_amount a period_amount,
 * arrastra current_amount (no lo toca) y avanza next_reset_on. Idempotente.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { computeReset, type Recurrence } from "@/modules/control/engine/recurrence";
import { logger } from "@/lib/logger";

/** Reinicia los frascos recurrentes vencidos. Devuelve cuántos reinició. */
export async function rollDueGoalPeriods(today: Date = new Date()): Promise<{ reset: number }> {
  const supabase = createServiceRoleClient();
  const todayIso = today.toISOString().slice(0, 10);

  const { data: goals, error } = await supabase
    .from("savings_goals")
    .select(
      "id,user_id,household_id,current_amount,target_amount,period_amount,recurrence,next_reset_on",
    )
    .neq("recurrence", "ninguna")
    .not("next_reset_on", "is", null)
    .lte("next_reset_on", todayIso);
  if (error) throw new Error(error.message);
  if (!goals || goals.length === 0) return { reset: 0 };

  let reset = 0;
  for (const g of goals) {
    try {
      // period_amount es la fuente del plan; si faltara (dato viejo), cae al target.
      const periodAmount =
        g.period_amount != null ? Number(g.period_amount) : Number(g.target_amount);
      const r = computeReset({
        periodAmount,
        currentAmount: Number(g.current_amount),
        nextResetOn: g.next_reset_on!,
        recurrence: g.recurrence as Recurrence,
        todayISO: todayIso,
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
        reset_on: todayIso,
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
