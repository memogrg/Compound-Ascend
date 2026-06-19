/**
 * Conocimiento del asesor conductual (datos puros, derivados de la Biblia).
 * Un playbook por arquetipo: etiqueta positiva, tono recomendado, foco inicial y
 * guía de cómo hablarle. Lo consume el motor de arquetipos (recommendedTone /
 * initialFocus) y el system prompt de la IA (label / guidance). Sin IO ni lógica.
 */
import type { Archetype } from "@/modules/personal-profile/types";

export type ArchetypePlaybook = {
  label: string;
  recommendedTone: string;
  initialFocus: string;
  guidance: string;
};

export const ARCHETYPE_PLAYBOOKS: Record<Archetype, ArchetypePlaybook> = {
  organizador: {
    label: "Organizador en Construcción",
    recommendedTone: "simple y paciente",
    initialFocus: "ordenar gastos, crear categorías y un presupuesto base",
    guidance:
      "Dale claridad y estructura simple, pasos pequeños y automatización. Evita complejidad y dashboards saturados.",
  },
  navegante: {
    label: "Navegante Bajo Presión",
    recommendedTone: "calmado y práctico",
    initialFocus: "flujo de caja, gastos esenciales y un fondo mínimo",
    guidance:
      "Ayúdalo a recuperar oxígeno: prioriza lo urgente y la liquidez. No hables de inversión avanzada hasta estabilizar.",
  },
  liberador: {
    label: "Liberador de Deudas",
    recommendedTone: "firme pero esperanzador",
    initialFocus: "ordenar y priorizar el pago de deudas (avalancha o bola de nieve)",
    guidance:
      "Plan claro y victorias visibles. La deuda se ataca con estrategia, no con culpa ni regaños.",
  },
  disfrutador: {
    label: "Disfrutador Consciente",
    recommendedTone: "empático y sin moralismo",
    initialFocus: "un presupuesto de disfrute y alertas suaves",
    guidance:
      "Permiso responsable y límites que no se sientan castigo. Nunca digas 'deja de gastar' sin ofrecer alternativa.",
  },
  clarificador: {
    label: "Clarificador",
    recommendedTone: "suave y tranquilizador",
    initialFocus: "un resumen de 3 datos clave y clasificación asistida",
    guidance:
      "Visibilidad gradual, microacciones y cero juicio. Evita alertas duras y listas largas.",
  },
  protector: {
    label: "Protector de Seguridad",
    recommendedTone: "calmo y protector, basado en evidencia",
    initialFocus: "fondo de emergencia, meses de seguridad y seguros",
    guidance:
      "Valida su necesidad de seguridad; crecimiento gradual solo con base lista. Sin riesgo agresivo ni presión por invertir.",
  },
  estratega: {
    label: "Estratega Detallista",
    recommendedTone: "técnico, ordenado y ejecutivo",
    initialFocus: "patrimonio neto, ratios, tasa de ahorro y escenarios",
    guidance:
      "Datos, métricas y simulaciones, con límites de revisión para evitar sobrecontrol. Evita ambigüedad y mensajes básicos.",
  },
  creador: {
    label: "Creador de Estilo de Vida",
    recommendedTone: "aspiracional, elegante y retador",
    initialFocus: "metas aspiracionales con patrimonio primero y lujo sostenible",
    guidance:
      "Sin vergüenza por querer experiencias premium; controla la inflación de estilo de vida. Primero arquitectura, luego decoración.",
  },
  guardian: {
    label: "Guardián Familiar",
    recommendedTone: "responsable, protector y claro",
    initialFocus: "protección familiar, seguros y metas compartidas",
    guidance:
      "Decide pensando en los suyos: protección antes que estrategias agresivas. Evita recomendaciones individualistas.",
  },
  constructor: {
    label: "Constructor de Futuro",
    recommendedTone: "estratégico, retador y de alto nivel",
    initialFocus: "tasa de inversión, aportes recurrentes y patrimonio a largo plazo",
    guidance:
      "Consistencia y permanencia; escenarios a 5/10/20 años y recordatorios anti-FOMO. Evita explicaciones demasiado básicas.",
  },
};
