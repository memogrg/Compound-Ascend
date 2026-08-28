/**
 * Resumen DETERMINISTA de un turno de coaching, para el hilo persistente (ai_coaching_thread).
 *
 * Sin LLM y sin riesgo de fabricación: sale de la SEÑAL PRIORITARIA (Priority Engine) + la ACCIÓN YA
 * RESUELTA (montos/entidad reconstruidos contra los datos reales en `resolveActionProposal`). Corto
 * (1-2 frases) para acotar tokens al re-inyectarlo. Módulo puro → testeable exhaustivamente.
 */

/** Acción propuesta ya resuelta (payload con montos/entidad reales). */
type ResolvedAction = { type: string; payload: Record<string, unknown> } | null;

const money = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? `₡${Math.round(v)}` : null;

/** Frase compacta y DETERMINISTA de lo que se recomendó (de la acción resuelta, no del texto del modelo). */
function actionPhrase(action: ResolvedAction): string | null {
  if (!action) return null;
  const p = action.payload;
  switch (action.type) {
    case "create_goal": {
      const m = money(p.monthlyContribution) ?? money(p.amount);
      return m ? `recomendé aportar ${m}/mes al fondo` : "recomendé crear el fondo";
    }
    case "debt_extra_payment": {
      const m = money(p.amount) ?? money(p.extraAmount);
      const n = typeof p.name === "string" && p.name.trim() ? p.name : "la deuda";
      return m ? `recomendé abonar ${m} a ${n}` : null;
    }
    case "set_dca": {
      const m = money(p.amount);
      const s = typeof p.symbol === "string" && p.symbol.trim() ? p.symbol : "tu inversión";
      return m ? `recomendé invertir ${m}/mes en ${s}` : null;
    }
    case "adjust_budget":
    case "move_budget": {
      const m = money(p.amount);
      return m ? `recomendé ajustar el presupuesto a ${m}` : null;
    }
    default:
      return null;
  }
}

/**
 * Construye el resumen del turno para el hilo: prioridad + (acción recomendada). null si no hubo ni
 * prioridad ni acción (no es un turno de coaching que valga la pena recordar). Acotado a 200 chars.
 */
export function buildCoachingSummary(
  priority: string | undefined,
  action: ResolvedAction,
): string | null {
  const parts: string[] = [];
  if (priority && priority.trim()) parts.push(`prioridad: ${priority.trim()}`);
  const ap = actionPhrase(action);
  if (ap) parts.push(ap);
  if (parts.length === 0) return null;
  return parts.join(" · ").slice(0, 200);
}
