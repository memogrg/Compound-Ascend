/**
 * El hallazgo, en la forma que la lectura necesita. Puro.
 *
 * Tipo PROPIO y no `Insight` de `lib/insights`: lo que se pinta es «cifra, causa y enlace a
 * la evidencia», que no es lo que la fila persistida guarda. El adaptador traduce; así la
 * primitiva no arrastra el modelo de la BD ni al revés.
 */
import { suggestedAction } from "@/lib/insights/actions";
import type { Insight, InsightSeverity, DetectedInsight } from "@/lib/insights/types";

export type { InsightSeverity };

export type InsightItem = {
  id: string;
  severidad: InsightSeverity;
  titulo: string;
  /** El número que sostiene el hallazgo, ya formateado. Sin él, es una opinión. */
  cifra?: string;
  /** Por qué pasa, en una frase. */
  causa: string;
  /** A dónde ir a verlo. */
  evidencia?: { etiqueta: string; href: string };
  /** Para filtrar la lista por la entidad que la originó (categoría, meta, deuda, holding). */
  relacionado?: { tipo: string; id: string };
};

/**
 * De un insight persistido (o recién detectado) a la fila que se pinta.
 *
 * El destino sale de `ACTIONS` de `lib/insights/actions.ts`, leído por su accesor público
 * `suggestedAction` —que además devuelve `undefined` para un kind desconocido en vez de
 * inventar una salida—. Es la fuente única: ahí ya vive «qué se puede hacer y dónde» para
 * los 26 tipos. Abrir un segundo mapa acá sería repetir lo que le pasó a `KIND_HREF` de la
 * campana, que lleva cinco tipos en paralelo y se quedó atrás.
 */
export function desdeInsight(
  insight: (DetectedInsight & { id?: string }) | Insight,
  opciones?: { cifra?: string },
): InsightItem {
  const accion = suggestedAction(insight.kind);
  return {
    id: "id" in insight && insight.id ? insight.id : insight.kind,
    severidad: insight.severity,
    titulo: insight.title,
    cifra: opciones?.cifra,
    causa: insight.body,
    // `label` de ACTIONS está en infinitivo («ajustar el presupuesto…»): sirve tal cual como
    // texto del enlace, y es el mismo verbo que usa el asesor al cerrar la observación.
    evidencia: accion ? { etiqueta: accion.label, href: accion.route } : undefined,
    relacionado:
      insight.relatedKind && insight.relatedId
        ? { tipo: insight.relatedKind, id: insight.relatedId }
        : undefined,
  };
}

/**
 * Tono de la severidad. `accionar` NO es rojo: la regla del blueprint es «verificables y
 * trazables, nunca alarmistas», y el rojo está reservado a lo que ya salió mal (deuda,
 * sobregiro). Lo que pide acción va en advertencia; lo que celebra, en acento.
 */
export const TONO_SEVERIDAD: Record<InsightSeverity, "acento" | "aviso" | "neutro"> = {
  celebrar: "acento",
  accionar: "aviso",
  observar: "aviso",
  info: "neutro",
};

/** Lo que oye quien no ve el ícono ni el color. */
export const LECTURA_SEVERIDAD: Record<InsightSeverity, string> = {
  celebrar: "Buena señal",
  accionar: "Requiere acción",
  observar: "Para observar",
  info: "Informativo",
};
