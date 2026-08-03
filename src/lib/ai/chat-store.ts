import "server-only";

/**
 * Persistencia del CHAT del asesor por usuario (UI web + móvil). A diferencia de conversation-store
 * (memoria rodante del LLM, ventana corta, ambos canales), esto guarda la conversación RETENIDA
 * (últimos CHAT_RETENTION_DAYS días) para que el hilo sobreviva a minimizar/refrescar/cambio de
 * dispositivo, para poder responder a un mensaje de días atrás y para enviar el TRANSCRIPT.
 *
 * PERSONAL: RLS por dueño (chat_messages). Dos cortes distintos y a propósito:
 *   - la UI y la memoria del asesor leen la VENTANA RETENIDA (loadRetainedChat),
 *   - el transcript por correo sigue siendo "la conversación de HOY" (loadTodayChat), que es lo
 *     que promete el botón: desde las 00:00 de Costa Rica (la app es es-CR, UTC−6 sin DST).
 * Lo que cae fuera de la retención lo borra el cron diario (purgeExpiredChatMessages).
 * Best-effort: cualquier fallo → [] / no-op, nunca rompe la respuesta.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { CHAT_RETENTION_DAYS, MAX_CHAT_MESSAGES, retentionCutoffISO } from "@/lib/ai/chat-retention";
import { logger } from "@/lib/logger";

/** Tope de mensajes del día que se leen para el transcript (el resto queda en la BD). */
export const MAX_DAY_MESSAGES = 300;

/** Costa Rica: UTC−6 fijo (sin DST). Corte del día = 00:00 hora CR. */
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;

export type StoredChatMessage = {
  /** id de la fila: lo que permite CITAR este mensaje (reply_to_message_id). */
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** Mensaje al que este responde. null = suelto, o el citado ya lo borró la retención. */
  replyToId: string | null;
};

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
 * Mensajes del chat del usuario desde `since` (cronológico viejo→nuevo), acotados a `limit`.
 * Toma los MÁS RECIENTES (DESC + limit) y los invierte. [] ante cualquier fallo.
 */
async function loadChatSince(
  since: string,
  limit: number,
  ctx?: AuthContext,
): Promise<StoredChatMessage[]> {
  const { db, userId } = await resolveAuth(ctx);
  let query = db
    .from("chat_messages")
    .select("id, role, content, created_at, reply_to_message_id")
    .gte("created_at", since);
  if (ctx) query = query.eq("user_id", userId); // service-role → filtro explícito
  const { data } = await query.order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).reverse().map(toStored);
}

/** Fila cruda → StoredChatMessage (el rol de la BD es texto libre con check). */
function toStored(r: {
  id: string;
  role: string;
  content: string;
  created_at: string;
  reply_to_message_id: string | null;
}): StoredChatMessage {
  return {
    id: r.id,
    role: r.role === "assistant" ? "assistant" : "user",
    content: r.content,
    createdAt: r.created_at,
    replyToId: r.reply_to_message_id,
  };
}

/**
 * Hilo que ve el usuario: la VENTANA RETENIDA (últimos CHAT_RETENTION_DAYS días), acotada a los
 * MAX_CHAT_MESSAGES más recientes para que abrir el chat no cargue una semana entera de golpe.
 * Es lo que hace que se pueda scrollear y responder a un mensaje de anteayer.
 */
export async function loadRetainedChat(ctx?: AuthContext): Promise<StoredChatMessage[]> {
  try {
    return await loadChatSince(retentionCutoffISO(Date.now()), MAX_CHAT_MESSAGES, ctx);
  } catch (err) {
    logger.warn("loadRetainedChat falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

/**
 * Mensajes del chat de HOY del usuario (cronológico viejo→nuevo), acotados a MAX_DAY_MESSAGES.
 * Solo para el TRANSCRIPT por correo, que promete "la conversación de hoy".
 */
export async function loadTodayChat(ctx?: AuthContext): Promise<StoredChatMessage[]> {
  try {
    return await loadChatSince(startOfCostaRicaDayISO(Date.now()), MAX_DAY_MESSAGES, ctx);
  } catch (err) {
    logger.warn("loadTodayChat falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

/**
 * LIMPIEZA de retención: borra los mensajes más viejos que CHAT_RETENTION_DAYS de TODOS los
 * usuarios. La corre el cron diario (/api/assistant/chat-retention), sin sesión, por lo que usa
 * el cliente service-role (bypassa RLS). Idempotente: correrlo dos veces borra lo mismo (nada la
 * segunda vez). Devuelve cuántas filas borró (null si Postgres no reportó el conteo).
 */
export async function purgeExpiredChatMessages(nowMs: number = Date.now()): Promise<number | null> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const db = createServiceRoleClient();
  const cutoff = retentionCutoffISO(nowMs);
  const { error, count } = await db
    .from("chat_messages")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (error) throw new Error(error.message);
  logger.info("chat.retention.purge", { cutoff, days: CHAT_RETENTION_DAYS, deleted: count ?? 0 });
  return count ?? null;
}

/**
 * Persiste mensajes del chat (user/assistant) y devuelve sus ids EN ORDEN (RETURNING respeta el
 * orden de los VALUES). Los ids importan: son lo que la UI necesita para poder CITAR un mensaje
 * recién enviado, sin esperar a recargar el hilo.
 *
 * `replyToMessageId` solo debe venir con un id YA verificado como existente y del usuario (lo
 * hace loadQuotedContext): la FK rechazaría un id fantasma y se perdería el turno entero.
 *
 * Best-effort: si el insert falla, no rompe nada — devuelve [].
 */
export async function appendChatMessages(
  ctx: AuthContext | undefined,
  msgs: { role: "user" | "assistant"; content: string; replyToMessageId?: string | null }[],
): Promise<string[]> {
  if (msgs.length === 0) return [];
  try {
    const { db, userId } = await resolveAuth(ctx);
    const rows = msgs.map((m) => ({
      user_id: userId,
      role: m.role,
      content: m.content,
      reply_to_message_id: m.replyToMessageId ?? null,
    }));
    const { data, error } = await db.from("chat_messages").insert(rows).select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id);
  } catch (err) {
    logger.warn("appendChatMessages falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

/**
 * Resuelve una CITA: el mensaje citado + su respuesta asociada (el otro lado del turno).
 *
 * Se lee bajo RLS (sin ctx), así que un id ajeno devuelve null aunque el request lo fabrique: es
 * la verificación de pertenencia que la FK no puede hacer. null también cuando la retención ya lo
 * borró — el caller degrada con aviso, no inventa contexto.
 *
 * El emparejado usa `gte`/`lte` y descarta el propio id, NO `gt`/`lt`: el par usuario+asistente se
 * inserta en UN solo statement, así que ambas filas comparten `created_at` (`now()` es el
 * timestamp de la transacción) y un `gt` estricto se saltaría justo la respuesta que se busca.
 */
export async function loadQuotedContext(
  messageId: string,
): Promise<{ quoted: StoredChatMessage; partner: StoredChatMessage | null } | null> {
  try {
    const { db } = await resolveAuth();
    const cols = "id, role, content, created_at, reply_to_message_id";
    const { data } = await db.from("chat_messages").select(cols).eq("id", messageId).maybeSingle();
    if (!data) return null;
    const quoted = toStored(data);

    // Si citó una pregunta suya, la pareja es la respuesta que vino DESPUÉS; si citó una respuesta
    // del asesor, es la pregunta que la provocó. Se piden pocas filas y se filtra en memoria.
    const buscaAsistente = quoted.role === "user";
    const vecinos = buscaAsistente
      ? await db
          .from("chat_messages")
          .select(cols)
          .gte("created_at", quoted.createdAt)
          .order("created_at", { ascending: true })
          .limit(4)
      : await db
          .from("chat_messages")
          .select(cols)
          .lte("created_at", quoted.createdAt)
          .order("created_at", { ascending: false })
          .limit(4);

    const partner =
      (vecinos.data ?? [])
        .map(toStored)
        .find((m) => m.id !== quoted.id && m.role === (buscaAsistente ? "assistant" : "user")) ??
      null;
    return { quoted, partner };
  } catch (err) {
    logger.warn("loadQuotedContext falló", { message: err instanceof Error ? err.message : "?" });
    return null;
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
