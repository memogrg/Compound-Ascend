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
  // Mover presupuesto de un sobre a otro: la salida de "un tap" del aviso de ritmo. Es UN
  // hecho para el usuario, así que es UNA acción y no dos `adjust_budget` que el usuario
  // tendría que confirmar por separado (y que podrían quedar a medias entre sí).
  | "move_budget"
  | "debt_extra_payment"
  | "create_transactions_batch"
  // "olvidá eso": archivar un hecho de la memoria personal. No mueve plata, pero borra algo que el
  // usuario dijo, así que pasa por la MISMA confirmación explícita — con el hecho a la vista en la
  // tarjeta, para que vea exactamente qué se va a olvidar antes de tocar nada.
  | "forget_memory";

const ACTION_TYPES: ReadonlySet<string> = new Set<AIActionType>([
  "create_transaction",
  "create_goal",
  "create_price_alert",
  "set_dca",
  "adjust_budget",
  "move_budget",
  "debt_extra_payment",
  "create_transactions_batch",
  "forget_memory",
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

/**
 * GLOBAL a propósito. Con la versión sin `/g`, `match` tomaba solo el primer bloque y `replace`
 * strippeaba solo ese: si el modelo emitía cuatro ```action```, tres se RENDERIZABAN CRUDOS en el
 * chat (JSON a la vista del usuario) y sus acciones se perdían. Un bloque ```action``` nunca debe
 * llegar a la pantalla.
 */
const ACTION_RE = /```action\s*([\s\S]*?)```/gi;

/** Convierte un bloque ya parseado en propuesta, o null si el tipo no es válido. */
function aPropuesta(crudo: string): AIActionProposal | null {
  try {
    const parsed = JSON.parse(crudo.trim()) as Partial<AIActionProposal>;
    if (!parsed.type || !isValidType(parsed.type)) return null;
    return {
      type: parsed.type,
      payload: (parsed.payload as Record<string, unknown>) ?? {},
      summary: typeof parsed.summary === "string" ? parsed.summary : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Extrae las acciones propuestas del texto del modelo y devuelve el texto LIMPIO + la acción.
 *
 * Se strippean TODOS los bloques aunque el JSON de alguno sea inválido: el usuario nunca debe ver
 * un ```action``` crudo, ni siquiera uno roto.
 *
 * VARIAS transacciones sueltas se fusionan en UN `create_transactions_batch`. La UI muestra una
 * acción por mensaje, así que quedarse con la primera dropearía las demás en silencio — y el caso
 * real que motivó esto (confirmar el alta de un estado de cuenta) son justo N altas juntas. Una
 * tarjeta de lote es además lo que corresponde mostrar ahí.
 */
export function parseAction(text: string): AIChatResponse {
  const bloques = [...text.matchAll(ACTION_RE)];
  if (bloques.length === 0) return { reply: text.trim(), action: null };

  const reply = text.replace(ACTION_RE, "").trim();
  const acciones = bloques
    .map((m) => aPropuesta(m[1] ?? ""))
    .filter((a): a is AIActionProposal => a !== null);
  if (acciones.length === 0) return { reply, action: null };
  if (acciones.length === 1) return { reply, action: acciones[0]! };

  const transacciones = acciones.filter((a) => a.type === "create_transaction");
  if (transacciones.length === acciones.length) {
    return {
      reply,
      action: {
        type: "create_transactions_batch",
        payload: { rows: transacciones.map((a) => a.payload) },
        summary: `Registrar ${transacciones.length} movimientos`,
      },
    };
  }
  // Mezcla de tipos distintos: se queda la primera (la UI muestra una), pero el texto ya salió
  // limpio de todos los bloques.
  return { reply, action: acciones[0]! };
}

function isValidType(t: string): t is AIActionType {
  return ACTION_TYPES.has(t);
}

/**
 * Tipos de fondo de defensa FORMAL que la acción `create_goal` del asesor puede declarar por
 * INTENCIÓN (no se infiere del nombre). getDefenseFundsReport (fund-sizing) solo cuenta metas con
 * uno de estos `goal_type`; una meta discrecional (viaje, carro) NUNCA los lleva.
 */
export type DefenseGoalType = "defensa:fondo_emergencia" | "defensa:fondo_paz";

const DEFENSE_GOAL_TYPES: ReadonlySet<string> = new Set<DefenseGoalType>([
  "defensa:fondo_emergencia",
  "defensa:fondo_paz",
]);

/**
 * Whitelist estricta del `goalType` que viaja en el payload de un `create_goal`. Devuelve el tipo
 * SOLO si es uno de los dos fondos formales; cualquier otro valor (ausente, basura, o un tipo que
 * no es de defensa) ⇒ undefined ⇒ meta genérica. Es la única puerta por la que el tipo declarado
 * por el asesor entra al borrador de la tarjeta de confirmación.
 */
export function defenseGoalType(payload: Record<string, unknown>): DefenseGoalType | undefined {
  const g = payload.goalType;
  return typeof g === "string" && DEFENSE_GOAL_TYPES.has(g) ? (g as DefenseGoalType) : undefined;
}
