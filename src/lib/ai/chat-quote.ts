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

/** Lo mínimo para elegir la pareja de un turno. */
export type PartnerCandidate = { id: string; role: "user" | "assistant" };

/**
 * De un mensaje citado y sus vecinos EN ORDEN DE CERCANÍA, elige la otra mitad del turno: si se
 * citó una pregunta del usuario, la respuesta del asesor; si se citó una respuesta, la pregunta
 * que la provocó.
 *
 * Filtra por id y no por timestamp a propósito. Desde 20260809000001 los dos lados del turno
 * tienen instantes distintos (clock_timestamp), pero las filas escritas ANTES comparten
 * created_at, así que el caller pide vecinos con `gte`/`lte` (no `gt`/`lt`, que se saltarían la
 * fila empatada) y el descarte del propio mensaje pasa a ser responsabilidad de acá. Correcto en
 * los dos mundos, que es lo que hace falta mientras convivan filas viejas y nuevas.
 */
export function pickPartner<T extends PartnerCandidate>(
  quoted: PartnerCandidate,
  vecinos: T[],
): T | null {
  const buscado = quoted.role === "user" ? "assistant" : "user";
  return vecinos.find((m) => m.id !== quoted.id && m.role === buscado) ?? null;
}

/**
 * Anota el turno del usuario para que el modelo sepa QUÉ está citando. La anotación va SOLO al
 * prompt: en `chat_messages` se persiste el mensaje crudo, sin decorar (si no, el historial se
 * llenaría de andamiaje y la próxima cita citaría la anotación).
 */
export function annotateReply(userMessage: string, quoted: QuotedMessage): string {
  const quien = quoted.role === "assistant" ? "tuyo (el asesor)" : "suyo";
  return [
    `[El usuario está RESPONDIENDO a este mensaje ${quien}, más arriba en la conversación:`,
    `"${quoteBloque(quoted.content, 1200)}"`,
    `Respondé entendiendo que su mensaje se refiere a eso.]`,
    "",
    userMessage,
  ].join("\n");
}

/**
 * Recorte que CONSERVA los saltos de línea, para lo que va al prompt.
 *
 * `quoteExcerpt` aplana todo a una línea — correcto para la burbuja de la UI, desastroso acá: si
 * el usuario citó una lista pegada (un estado de cuenta, un desglose), el modelo la recibía como
 * un renglón interminable y perdía la estructura de filas que es justamente lo que se le pide
 * leer. El tope es más generoso por lo mismo.
 */
export function quoteBloque(content: string, max: number): string {
  const t = content.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

/**
 * ¿El mensaje APUNTA a lo citado en vez de traer su propia consulta? ("¿estas están registradas?",
 * "¿y esto?", "lo de arriba", "esos gastos").
 *
 * Es la señal que permite resolver la referencia: cuando el usuario responde con un pronombre, el
 * pedido real está en el mensaje CITADO, no en el que acaba de escribir. Sin esto, "¿estas están
 * registradas?" no matchea ningún carril —no nombra sobre, periodo ni nada— y se contesta con
 * cualquier cosa.
 */
export function pareceReferenciaACitado(text: string): boolean {
  return /\b(?:est[aeo]s?|es[aeo]s?|aquell[aeo]s?|lo de arriba|de arriba|lo anterior|el anterior|la anterior|ah[ií]|eso)(?!\p{L})/iu.test(
    text.trim(),
  );
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
