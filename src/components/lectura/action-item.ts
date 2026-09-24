/**
 * La acción de la franja, y su adaptador desde el motor de acciones. Puro.
 */
import type { Action } from "@/modules/actions/types";

export type ActionStripData = {
  principal: { etiqueta: string; href: string; impacto?: string };
  /** Si viene, la principal NO se ofrece: se explica por qué no se puede. */
  bloqueada?: { motivo: string };
  /** Pregunta que se le deja escrita al asesor, sin enviar. */
  asesor?: { pregunta: string };
};

/**
 * De una `Action` del motor a la franja.
 *
 * Se respeta `locked`: una acción bloqueada muestra su motivo y **no** pinta un botón. Un
 * control que no hace nada es peor que no ofrecerlo — es la misma regla que ya aplica
 * `action-card.tsx`, y acá se hereda en vez de reinventarse.
 */
export function desdeAction(action: Action): ActionStripData {
  return {
    principal: {
      etiqueta: action.title,
      href: action.route,
      // `impact.label` ya viene en lenguaje humano y con su moneda; no se recompone acá.
      impacto: action.impact.label || undefined,
    },
    bloqueada: action.locked
      ? { motivo: action.lockReason ?? "Todavía no se puede hacer" }
      : undefined,
    asesor: { pregunta: `¿Por qué me recomendás «${action.title}» ahora?` },
  };
}
