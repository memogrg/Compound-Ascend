import "server-only";
/**
 * Hilo de coaching persistente (ai_coaching_thread): la memoria LONGITUDINAL de la GUÍA del asesor,
 * separada del chat de 7 días. Con esto un check-in mensual ve lo que ya se recomendó los meses previos
 * y puede HILAR ("el mes pasado enfocamos el fondo…") en vez de arrancar fresco cada vez.
 *
 * Seam ctx-inyectable (resolveAuth): sin ctx = sesión por cookies (RLS); con ctx = cliente/usuario
 * inyectados (sim/headless). Best-effort: si el store falla, el chat sigue sin el hilo.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { logger } from "@/lib/logger";

/** Cuántas entradas del hilo se cargan al contexto (acota tokens; ~medio año de check-ins mensuales). */
const MAX_COACHING = 6;

export type CoachingEntry = { date: string; summary: string };

/**
 * La parte ESTRUCTURADA de la recomendación, para poder verificar después si se cumplió. El resumen
 * en texto sigue siendo lo que se re-inyecta al prompt; esto es lo que se cruza con los datos.
 *
 * `baseline` es el valor de la entidad HOY (acumulado de la meta, saldo de la deuda). Se captura al
 * recomendar porque después ya no se puede reconstruir: sin él no se distingue "avanzó por el
 * consejo" de "ya venía avanzando", y celebrar lo segundo suena a que el asesor no está mirando.
 */
export type SeguimientoRecomendacion = {
  actionType: string;
  actionRef: string;
  actionAmount?: number | null;
  baseline?: number | null;
};

/** Persiste un resumen de coaching (best-effort: no rompe el turno si el insert falla). */
export async function appendCoachingSummary(
  summary: string,
  ctx?: AuthContext,
  seguimiento?: SeguimientoRecomendacion | null,
): Promise<void> {
  const s = summary.trim();
  if (!s) return;
  try {
    const { db, userId } = await resolveAuth(ctx);
    const { error } = await db.from("ai_coaching_thread").insert({
      user_id: userId,
      summary: s,
      // Sin acción resuelta la fila entra igual (el hilo la sigue re-inyectando como texto), pero
      // marcada 'sin_seguimiento': no hay nada que verificar y no debe quedar abierta para siempre.
      action_type: seguimiento?.actionType ?? null,
      action_ref: seguimiento?.actionRef ?? null,
      action_amount: seguimiento?.actionAmount ?? null,
      action_baseline: seguimiento?.baseline ?? null,
      follow_status: seguimiento ? "abierta" : "sin_seguimiento",
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("appendCoachingSummary falló", {
      message: err instanceof Error ? err.message : "?",
    });
  }
}

/**
 * Carga las últimas MAX_COACHING entradas en orden cronológico (viejo→nuevo) para inyectarlas como el
 * "hilo de coaching". Devuelve [] ante cualquier fallo (best-effort). `date` = YYYY-MM (mes del consejo).
 */
export async function loadCoachingThread(ctx?: AuthContext): Promise<CoachingEntry[]> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    let query = db.from("ai_coaching_thread").select("summary, created_at");
    if (ctx) query = query.eq("user_id", userId); // service-role → filtro explícito; sesión → RLS
    const { data } = await query.order("created_at", { ascending: false }).limit(MAX_COACHING);
    return (data ?? [])
      .reverse()
      .map((r) => ({ date: String(r.created_at).slice(0, 7), summary: r.summary as string }));
  } catch (err) {
    logger.warn("loadCoachingThread falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}
