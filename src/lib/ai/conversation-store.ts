import "server-only";

/**
 * Memoria conversacional del asesor IA (chat web). Capa PERSISTENTE por usuario en
 * ai_conversation_turns. Acota el consumo de tokens con un tope de turnos (MAX_TURNS)
 * y una ventana de tiempo (WINDOW_MIN). Best-effort: si el store falla, el chat sigue sin memoria.
 *
 * Auth: resolveAuth(ctx) — sesión (RLS) si ctx undefined; service-role (sin sesión: cron/ingesta)
 * con userId explícito si se inyecta ctx. Con service-role SIEMPRE se filtra/inserta por userId.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import type { ChatMessage } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";
import { CHAT_RETENTION_DAYS, retentionCutoffISO } from "@/lib/ai/chat-retention";

/** Máximo de turnos recientes que se recuperan como contexto (control de tokens). */
const MAX_TURNS = 10;
/** Ventana de tiempo: solo turnos de los últimos WINDOW_MIN minutos. */
const WINDOW_MIN = 120;

export type ConversationChannel = "web";
type TurnRole = "user" | "assistant";

/**
 * Recupera los últimos MAX_TURNS turnos del usuario dentro de la ventana, en orden cronológico
 * (viejo→nuevo) para inyectarlos como historial. Ordena DESC + limit para tomar los MÁS RECIENTES
 * y los invierte a ascendente. Devuelve [] ante cualquier fallo (best-effort).
 */
export async function loadRecentTurns(ctx?: AuthContext): Promise<ChatMessage[]> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
    let query = db.from("ai_conversation_turns").select("role, content").gte("created_at", since);
    // Sesión → RLS filtra por dueño; service-role (ctx inyectado) → filtro explícito por userId.
    if (ctx) query = query.eq("user_id", userId);
    const { data } = await query.order("created_at", { ascending: false }).limit(MAX_TURNS);
    return (data ?? [])
      .reverse() // DESC → cronológico (viejo→nuevo) para el prompt
      .map((r) => ({ role: r.role as TurnRole, content: r.content }));
  } catch (err) {
    logger.warn("loadRecentTurns falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

/**
 * Persiste turnos (user/assistant) del usuario. Best-effort: si el insert falla, NO rompe la
 * respuesta ya enviada. El userId sale de resolveAuth (sesión o ctx inyectado).
 */
export async function appendTurns(
  ctx: AuthContext | undefined,
  turns: { role: TurnRole; content: string; channel: ConversationChannel }[],
): Promise<void> {
  if (turns.length === 0) return;
  try {
    const { db, userId } = await resolveAuth(ctx);
    const rows = turns.map((t) => ({
      user_id: userId,
      channel: t.channel,
      role: t.role,
      content: t.content,
    }));
    const { error } = await db.from("ai_conversation_turns").insert(rows);
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("appendTurns falló", { message: err instanceof Error ? err.message : "?" });
  }
}

/**
 * LIMPIEZA de retención de los turnos. Borra todo lo más viejo que CHAT_RETENTION_DAYS,
 * para TODOS los usuarios. La corre el cron diario (/api/assistant/chat-retention) junto
 * con la purga de `chat_messages`.
 *
 * Por qué existía el problema: `loadRecentTurns` solo mira los últimos WINDOW_MIN (120)
 * minutos, así que un turno de anteayer ya era INALCANZABLE — pero seguía en la tabla.
 * Sin borrado, `ai_conversation_turns` crecía sin techo guardando conversaciones que la
 * interfaz promete conservar solo 1 semana. El dato no se leía, pero existía.
 *
 * El corte es el MISMO de `chat_messages` (7 días) y no los 120 minutos de lectura: así
 * «1 semana» es literalmente cierto en las dos tablas. Recortar a la ventana de lectura
 * sería técnicamente suficiente, pero dejaría la promesa y el dato desalineados al revés
 * — borraríamos antes de lo prometido, y la extracción de memoria del cron se quedaría
 * sin material.
 *
 * Sin sesión (recorre a todos), así que va con service-role. Idempotente: el corte es por
 * fecha. Devuelve cuántas borró, o `null` si falló.
 */
export async function purgeExpiredConversationTurns(
  nowMs: number = Date.now(),
): Promise<number | null> {
  const cutoff = retentionCutoffISO(nowMs);
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
    const db = createServiceRoleClient();
    const { error, count } = await db
      .from("ai_conversation_turns")
      .delete({ count: "exact" })
      .lt("created_at", cutoff);
    if (error) throw new Error(error.message);
    logger.info("conversation.retention.purge", {
      cutoff,
      days: CHAT_RETENTION_DAYS,
      deleted: count ?? 0,
    });
    return count ?? null;
  } catch (err) {
    // A diferencia de purgeExpiredChatMessages —que LANZA— este degrada: `chat_messages`
    // es la promesa al usuario y su fallo tiene que ser ruidoso; esto es limpieza interna
    // de una tabla que ya nadie lee, y no puede tumbar el cron ni tapar el resultado del
    // paso que sí importa. Queda el rastro en el log y el contador viaja como null.
    logger.warn("conversation.retention.purge falló", {
      cutoff,
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}
