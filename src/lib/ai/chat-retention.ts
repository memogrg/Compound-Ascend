/**
 * RETENCIÓN DEL CHAT — la única fuente de verdad de "cuánto se guarda el historial".
 *
 * Módulo PURO y sin "server-only" a propósito: lo importan las tres partes que tienen que
 * estar de acuerdo, y una de ellas es cliente:
 *   - el cron de limpieza  (/api/assistant/chat-retention) → qué borrar,
 *   - la carga del hilo    (lib/ai/chat-store)             → qué leer,
 *   - el aviso al usuario  (components/ai/assistant-conversation) → qué prometemos.
 *
 * Subir la retención a 30 días es cambiar CHAT_RETENTION_DAYS y nada más: el corte, la
 * ventana leída y el texto del aviso ("1 semana" → "30 días") salen todos de acá.
 *
 * NO confundir con la ventana del LLM (lib/ai/history · LLM_HISTORY_WINDOW): al modelo se le
 * siguen mandando solo los últimos N turnos, sin importar cuánto historial se retenga.
 */

/** Días que se conserva el historial de chat. Un solo lugar: cambiar acá cambia todo. */
export const CHAT_RETENTION_DAYS = 7;

/**
 * Tope de mensajes que la UI carga de la ventana retenida (los MÁS RECIENTES). Protege
 * memoria y render: la semana entera se conserva en la BD, pero el hilo abre con esto.
 */
export const MAX_CHAT_MESSAGES = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instante (ISO) a partir del cual un mensaje sigue vigente. Más viejo que esto → se borra. */
export function retentionCutoffISO(nowMs: number, days: number = CHAT_RETENTION_DAYS): string {
  return new Date(nowMs - days * DAY_MS).toISOString();
}

/** "1 semana" / "2 semanas" / "30 días" — en semanas cuando es múltiplo exacto de 7. */
export function retentionWindowLabel(days: number = CHAT_RETENTION_DAYS): string {
  if (days % 7 === 0) {
    const weeks = days / 7;
    return weeks === 1 ? "1 semana" : `${weeks} semanas`;
  }
  return days === 1 ? "1 día" : `${days} días`;
}

/**
 * Aviso persistente en la conversación. Impersonal a propósito ("se guarda"/"se borran"):
 * sirve igual para el voseo de la web y el "tú" del móvil, sin duplicar copy.
 */
export function retentionNoticeText(days: number = CHAT_RETENTION_DAYS): string {
  return `Tu historial de chat se guarda por ${retentionWindowLabel(days)}; los mensajes más viejos se borran solos.`;
}
