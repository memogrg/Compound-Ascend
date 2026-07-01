import "server-only";

/**
 * Memoria conversacional unificada del asesor IA (chat web + WhatsApp). Capa PERSISTENTE por
 * usuario en ai_conversation_turns. Acota el consumo de tokens con un tope de turnos (MAX_TURNS)
 * y una ventana de tiempo (WINDOW_MIN). Best-effort: si el store falla, el chat sigue sin memoria.
 *
 * Auth: resolveAuth(ctx) — sesión (RLS) si ctx undefined; service-role (webhook) con userId
 * explícito si se inyecta ctx. Con service-role SIEMPRE se filtra/inserta por userId.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import type { ChatMessage } from "@/lib/ai/provider";
import { logger } from "@/lib/logger";

/** Máximo de turnos recientes que se recuperan como contexto (control de tokens). */
const MAX_TURNS = 10;
/** Ventana de tiempo: solo turnos de los últimos WINDOW_MIN minutos. */
const WINDOW_MIN = 120;

export type ConversationChannel = "web" | "whatsapp";
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
    let query = db
      .from("ai_conversation_turns")
      .select("role, content")
      .gte("created_at", since);
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
