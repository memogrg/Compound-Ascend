/**
 * Manejo del historial de conversación para el LLM (puro, sin "server-only": testeable).
 *
 * Acota el ARRASTRE: el modelo ve solo los últimos turnos como contexto — no toda la conversación —
 * para que no re-imprima ni recalcule lo viejo (ahí es donde repite disclaimers y cifras) y para
 * bajar tokens. La memoria persistente completa vive en la BD; esto es solo la ventana del prompt.
 */
import type { ChatMessage } from "@/lib/ai/provider";

/** Ventana de historial que se le manda al LLM (turnos, incluyendo el actual del usuario). */
export const LLM_HISTORY_WINDOW = 8;

/** Últimos N mensajes para el LLM (el turno actual del usuario, que es el último, siempre entra). */
export function capHistory(messages: ChatMessage[], window = LLM_HISTORY_WINDOW): ChatMessage[] {
  return messages.length > window ? messages.slice(-window) : messages;
}

/** Respuestas previas del asistente: para que el guardrail no repita una nota ya dicha antes. */
export function priorAssistantReplies(messages: ChatMessage[]): string[] {
  return messages.filter((m) => m.role === "assistant").map((m) => m.content);
}
