/**
 * Tipos y parsing de acciones propuestas por la IA (módulo puro, sin secretos).
 * La IA PROPONE; ninguna acción se ejecuta sin confirmación explícita del usuario.
 */

// Solo acciones EJECUTABLES (propuesta → confirmación → creación). Las "sugerencias" no
// ejecutables (estrategia de deuda, ajuste de presupuesto) van como texto normal, no como acción.
export type AIActionType = "create_transaction" | "create_goal";

export type AIActionProposal = {
  type: AIActionType;
  payload: Record<string, unknown>;
  /** Resumen legible para la tarjeta de confirmación. */
  summary?: string;
};

export type AIChatResponse = {
  reply: string;
  action: AIActionProposal | null;
};

const ACTION_RE = /```action\s*([\s\S]*?)```/i;

/**
 * Extrae una acción propuesta (bloque ```action {json}```) del texto del modelo
 * y devuelve el texto limpio + la acción (o null). Tolera JSON inválido.
 */
export function parseAction(text: string): AIChatResponse {
  const match = text.match(ACTION_RE);
  if (!match) return { reply: text.trim(), action: null };

  const reply = text.replace(ACTION_RE, "").trim();
  try {
    const parsed = JSON.parse(match[1]!.trim()) as Partial<AIActionProposal>;
    if (!parsed.type || !isValidType(parsed.type)) return { reply, action: null };
    return {
      reply,
      action: {
        type: parsed.type,
        payload: (parsed.payload as Record<string, unknown>) ?? {},
        summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
      },
    };
  } catch {
    return { reply, action: null };
  }
}

function isValidType(t: string): t is AIActionType {
  return t === "create_transaction" || t === "create_goal";
}
