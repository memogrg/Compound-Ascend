/**
 * CITAS DEL CHAT — helpers puros de "responder a un mensaje pasado".
 *
 * Sin "server-only" a propósito, como chat-retention: los usan las dos puntas y tienen que
 * coincidir. El cliente arma el fragmento que se ve en la burbuja; el servidor arma el bloque
 * que se le manda al modelo. Si el recorte fuera distinto en cada lado, el usuario vería citar
 * una cosa y el asesor leería otra.
 */
import type { ChatMessage } from "@/lib/ai/provider";

/** Largo del fragmento citado que se muestra en la UI. Una línea, no un párrafo. */
export const QUOTE_EXCERPT_MAX = 120;

/** Aviso cuando el mensaje citado ya no existe (lo borró la retención). Vale para web y móvil. */
export const QUOTE_MISSING_TEXT = "Ese mensaje ya no está en tu historial.";

/**
 * Fragmento de una sola línea para mostrar la cita: aplana saltos y markdown de énfasis y
 * recorta con elipsis. Recorta en el último espacio para no cortar una palabra al medio.
 */
export function quoteExcerpt(content: string, max: number = QUOTE_EXCERPT_MAX): string {
  const flat = content
    .replace(/```[\s\S]*?```/g, "[bloque]")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Mensaje citado tal como lo necesita el prompt (rol + texto). */
export type QuotedMessage = { role: "user" | "assistant"; content: string };

/**
 * Anota el turno del usuario para que el modelo sepa QUÉ está citando. La anotación va SOLO al
 * prompt: en `chat_messages` se persiste el mensaje crudo, sin decorar (si no, el historial se
 * llenaría de andamiaje y la próxima cita citaría la anotación).
 */
export function annotateReply(userMessage: string, quoted: QuotedMessage): string {
  const quien = quoted.role === "assistant" ? "tuyo (el asesor)" : "suyo";
  return [
    `[El usuario está RESPONDIENDO a este mensaje ${quien}, más arriba en la conversación:`,
    `"${quoteExcerpt(quoted.content, 600)}"`,
    `Respondé entendiendo que su mensaje se refiere a eso.]`,
    "",
    userMessage,
  ].join("\n");
}

/**
 * Contexto del turno cuando hay cita: el par citado (mensaje + su respuesta asociada) va
 * DELANTE de la ventana reciente, aunque haya quedado fuera de ella por antigüedad — que es
 * justamente el caso que da sentido a citar.
 *
 * `windowIds` son los ids que la ventana reciente YA trae: si el mensaje citado sigue ahí no se
 * duplica (el modelo lo vería dos veces y creería que se dijo dos veces).
 *
 * El costo es de unos cientos de tokens y SOLO en el turno que cita.
 */
export function buildQuotedContext(
  pair: QuotedMessage[],
  windowIds: Set<string>,
  quotedIds: string[],
): ChatMessage[] {
  return pair
    .filter((_, i) => !windowIds.has(quotedIds[i] ?? ""))
    .map((m) => ({ role: m.role, content: m.content }) as ChatMessage);
}
