"use server";

/**
 * Server Actions de "Mis acciones". Lo único que se escribe es la DECISIÓN de la persona sobre
 * una acción — la acción misma se deriva de los motores en cada corrida.
 *
 * `household_id` va en el insert como en toda escritura de datos de usuario (guard de
 * tests/unit/household-propagation.test.ts). La RLS de esta tabla es personal: la columna
 * etiqueta el dato al hogar, no abre la lectura.
 */
import { revalidarRutas } from "@/lib/revalidation/rutas-espejo";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveHouseholdId } from "@/lib/household/active";
import { dismissInsight } from "@/lib/insights";
import { logger } from "@/lib/logger";
import {
  dismissSchema,
  markDoneSchema,
  prioritySchema,
  snoozeSchema,
  actionKeySchema,
} from "@/modules/actions/schemas";
import type { ActionImpact, ActionStatus } from "@/modules/actions/types";

export type ActionResult = { ok: boolean; message?: string };

/** Repinta las cuatro pantallas donde una acción cambia algo (web + móvil vía el espejo). */
function repintar(): void {
  revalidarRutas("/mis-acciones", "/dashboard");
}

/** Upsert del estado por (user_id, action_key): una decisión por acción, la última manda. */
async function guardarEstado(input: {
  key: string;
  status: ActionStatus;
  snoozeUntil?: string | null;
  impact?: ActionImpact | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const householdId = await getActiveHouseholdId(supabase, user.id);
  const { error } = await supabase.from("user_action_states").upsert(
    {
      user_id: user.id,
      household_id: householdId,
      action_key: input.key,
      status: input.status,
      snooze_until: input.snoozeUntil ?? null,
      impact: (input.impact ?? null) as never,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,action_key" },
  );
  if (error) {
    logger.warn("actions.estado_no_guardado", { status: input.status, error: error.message });
    return { ok: false, message: "No se pudo guardar. Intentalo de nuevo." };
  }
  repintar();
  return { ok: true };
}

/** «Lo hago»: registra el impacto que traía la acción, congelado para el progreso. */
export async function markActionDone(key: string, impact?: ActionImpact): Promise<ActionResult> {
  const parsed = markDoneSchema.safeParse({ key, impact });
  if (!parsed.success) return { ok: false, message: "Acción inválida." };
  return guardarEstado({
    key: parsed.data.key,
    status: "hecha",
    impact: parsed.data.impact ?? null,
  });
}

/** «Recordarme»: la acción vuelve sola cuando llegue la fecha. */
export async function snoozeAction(key: string, untilISO: string): Promise<ActionResult> {
  const parsed = snoozeSchema.safeParse({ key, until: untilISO });
  if (!parsed.success) return { ok: false, message: "Fecha inválida." };
  return guardarEstado({
    key: parsed.data.key,
    status: "pospuesta",
    snoozeUntil: parsed.data.until,
  });
}

/**
 * «No por ahora». Si la acción nació de un insight, se descarta también el insight: si no, la
 * campana volvería a decir mañana exactamente lo que la persona acaba de rechazar.
 */
export async function dismissAction(key: string, relatedInsightId?: string): Promise<ActionResult> {
  const parsed = dismissSchema.safeParse({ key, relatedInsightId });
  if (!parsed.success) return { ok: false, message: "Acción inválida." };
  const res = await guardarEstado({ key: parsed.data.key, status: "descartada" });
  if (res.ok && parsed.data.relatedInsightId) {
    await dismissInsight(parsed.data.relatedInsightId).catch((err) => {
      logger.warn("actions.insight_no_descartado", { error: String(err) });
    });
  }
  return res;
}

/** «Reactivar» (desde Progreso): borra la decisión y la acción vuelve a competir por su lugar. */
export async function reactivateAction(key: string): Promise<ActionResult> {
  const parsed = actionKeySchema.safeParse(key);
  if (!parsed.success) return { ok: false, message: "Acción inválida." };
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_action_states")
    .delete()
    .eq("user_id", user.id)
    .eq("action_key", parsed.data);
  if (error) return { ok: false, message: "No se pudo reactivar." };
  repintar();
  return { ok: true };
}

/** Cambia la prioridad declarada. Reordena y cambia el tono; no cambia ninguna regla. */
export async function setActionPriority(priority: string): Promise<ActionResult> {
  const parsed = prioritySchema.safeParse({ priority });
  if (!parsed.success) return { ok: false, message: "Prioridad inválida." };
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ action_priority: parsed.data.priority })
    .eq("id", user.id);
  if (error) return { ok: false, message: "No se pudo guardar tu prioridad." };
  repintar();
  return { ok: true };
}
