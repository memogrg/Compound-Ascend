/**
 * Tipos y parsing de acciones propuestas por la IA (módulo puro, sin secretos).
 * La IA PROPONE; ninguna acción se ejecuta sin confirmación explícita del usuario.
 */

/**
 * Acciones EJECUTABLES (propuesta → confirmación → ejecución). Nada financiero pasa sin el tap
 * de confirmación del usuario.
 *
 * Las tres últimas son las que convierten un CONSEJO en algo que se puede hacer de una: si el
 * asesor dice "apartá $200/mes para el viaje" o "abonale ₡100.000 extra a la tarjeta", eso deja
 * de ser un texto que el usuario tiene que ir a ejecutar a mano en otra pantalla.
 *
 * Toda propuesta pasa por `resolveActionProposal` antes de llegar a la tarjeta: los ids y los
 * montos se reconstruyen contra los datos REALES del usuario, no se toman del modelo.
 */
export type AIActionType =
  | "create_transaction"
  | "create_goal"
  | "create_price_alert"
  | "set_dca"
  | "adjust_budget"
  | "debt_extra_payment";

const ACTION_TYPES: ReadonlySet<string> = new Set<AIActionType>([
  "create_transaction",
  "create_goal",
  "create_price_alert",
  "set_dca",
  "adjust_budget",
  "debt_extra_payment",
]);

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
  return ACTION_TYPES.has(t);
}
