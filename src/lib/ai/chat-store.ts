import "server-only";

/**
 * Persistencia del CHAT del asesor por usuario (UI web + móvil). A diferencia de conversation-store
 * (memoria rodante del LLM, ventana corta, ambos canales), esto guarda la conversación del DÍA para
 * que el hilo sobreviva a minimizar/refrescar/cambio de dispositivo y para enviar el TRANSCRIPT.
 *
 * PERSONAL: RLS por dueño (chat_messages). Corte "del día" = desde las 00:00 de Costa Rica (la app
 * es es-CR, UTC−6 sin horario de verano). Tope de filas leídas para que no crezca infinito.
 * Best-effort: cualquier fallo → [] / no-op, nunca rompe la respuesta.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { logger } from "@/lib/logger";

/** Tope de mensajes del día que se leen (protege memoria/tokens; el resto queda en la BD). */
export const MAX_DAY_MESSAGES = 300;

/** Costa Rica: UTC−6 fijo (sin DST). Corte del día = 00:00 hora CR. */
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;

export type StoredChatMessage = { role: "user" | "assistant"; content: string; createdAt: string };

/**
 * Instante UTC (ISO) de las 00:00 de Costa Rica del día que contiene `nowMs`. Puro y testeable:
 * corre el reloj a la pared CR, trunca a medianoche y lo devuelve a UTC.
 */
export function startOfCostaRicaDayISO(nowMs: number): string {
  const cr = new Date(nowMs - CR_OFFSET_MS);
  cr.setUTCHours(0, 0, 0, 0);
  return new Date(cr.getTime() + CR_OFFSET_MS).toISOString();
}

/**
 * Mensajes del chat de HOY del usuario (cronológico viejo→nuevo), acotados a MAX_DAY_MESSAGES.
 * Toma los MÁS RECIENTES del día (DESC + limit) y los invierte. [] ante cualquier fallo.
 */
export async function loadTodayChat(ctx?: AuthContext): Promise<StoredChatMessage[]> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    const since = startOfCostaRicaDayISO(Date.now());
    let query = db
      .from("chat_messages")
      .select("role, content, created_at")
      .gte("created_at", since);
    if (ctx) query = query.eq("user_id", userId); // service-role → filtro explícito
    const { data } = await query.order("created_at", { ascending: false }).limit(MAX_DAY_MESSAGES);
    return (data ?? [])
      .reverse()
      .map((r) => ({ role: r.role === "assistant" ? "assistant" : "user", content: r.content, createdAt: r.created_at }));
  } catch (err) {
    logger.warn("loadTodayChat falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

/** Persiste mensajes del chat (user/assistant). Best-effort: si el insert falla, no rompe nada. */
export async function appendChatMessages(
  ctx: AuthContext | undefined,
  msgs: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  if (msgs.length === 0) return;
  try {
    const { db, userId } = await resolveAuth(ctx);
    const rows = msgs.map((m) => ({ user_id: userId, role: m.role, content: m.content }));
    const { error } = await db.from("chat_messages").insert(rows);
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("appendChatMessages falló", { message: err instanceof Error ? err.message : "?" });
  }
}

/**
 * Transcript en TEXTO LIMPIO de una conversación (puro, testeable). Cada turno con su hora (CR) y
 * el rol legible. Sin HTML/markdown crudo — se aplana el contenido para el correo.
 */
export function buildTranscriptText(
  msgs: StoredChatMessage[],
  opts: { name?: string; dateLabel: string },
): string {
  const header = `Conversación con My Agent C+ — ${opts.dateLabel}${opts.name ? ` · ${opts.name}` : ""}`;
  const lines = msgs.map((m) => {
    const who = m.role === "assistant" ? "My Agent C+" : opts.name || "Vos";
    const time = new Date(new Date(m.createdAt).getTime() - CR_OFFSET_MS)
      .toISOString()
      .slice(11, 16); // HH:MM hora CR
    return `[${time}] ${who}: ${flatten(m.content)}`;
  });
  return `${header}\n${"-".repeat(header.length)}\n\n${lines.join("\n\n")}\n`;
}

/** Aplana el contenido a texto plano: sin markdown de énfasis/enlaces ni saltos excesivos. */
function flatten(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, "[bloque]") // bloques de código/acciones
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/\s*\n\s*\n\s*/g, " ")
    .replace(/\n/g, " ")
    .trim();
}
