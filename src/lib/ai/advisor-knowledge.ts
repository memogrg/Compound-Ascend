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
  /** Frase POSITIVA de cara al usuario (pantalla de cierre del onboarding). */
  userSummary: string;
};

export const ARCHETYPE_PLAYBOOKS: Record<Archetype, ArchetypePlaybook> = {
  organizador: {
    label: "Organizador en Construcción",
    recommendedTone: "simple y paciente",
    initialFocus: "ordenar gastos, crear categorías y un presupuesto base",
    guidance:
      "Dale claridad y estructura simple, pasos pequeños y automatización. Evita complejidad y dashboards saturados.",
    userSummary: "Quieres ordenar tus finanzas y construir un sistema simple que puedas sostener.",
  },
  navegante: {
    label: "Navegante Bajo Presión",
    recommendedTone: "calmado y práctico",
    initialFocus: "flujo de caja, gastos esenciales y un fondo mínimo",
    guidance:
      "Ayúdalo a recuperar oxígeno: prioriza lo urgente y la liquidez. No hables de inversión avanzada hasta estabilizar.",
    userSummary: "Quieres recuperar oxígeno y estabilidad antes de pensar en lo siguiente.",
  },
  liberador: {
    label: "Liberador de Deudas",
    recommendedTone: "firme pero esperanzador",
    initialFocus: "ordenar y priorizar el pago de deudas (avalancha o bola de nieve)",
    guidance:
      "Plan claro y victorias visibles. La deuda se ataca con estrategia, no con culpa ni regaños.",
    userSummary: "Quieres liberarte de tus deudas con un plan claro y sin culpa.",
  },
  disfrutador: {
    label: "Disfrutador Consciente",
    recommendedTone: "empático y sin moralismo",
    initialFocus: "un presupuesto de disfrute y alertas suaves",
    guidance:
      "Permiso responsable y límites que no se sientan castigo. Nunca digas 'deja de gastar' sin ofrecer alternativa.",
    userSummary: "Quieres disfrutar tu presente sin sabotear tu futuro.",
  },
  clarificador: {
    label: "Clarificador",
    recommendedTone: "suave y tranquilizador",
    initialFocus: "un resumen de 3 datos clave y clasificación asistida",
    guidance:
      "Visibilidad gradual, microacciones y cero juicio. Evita alertas duras y listas largas.",
    userSummary: "Quieres ver tus finanzas con claridad, paso a paso y sin presión.",
  },
  protector: {
    label: "Protector de Seguridad",
    recommendedTone: "calmo y protector, basado en evidencia",
    initialFocus: "fondo de emergencia, meses de seguridad y seguros",
    guidance:
      "Valida su necesidad de seguridad; crecimiento gradual solo con base lista. Sin riesgo agresivo ni presión por invertir.",
    userSummary: "Quieres una base segura que te deje dormir tranquilo antes de crecer.",
  },
  estratega: {
    label: "Estratega Detallista",
    recommendedTone: "técnico, ordenado y ejecutivo",
    initialFocus: "patrimonio neto, ratios, tasa de ahorro y escenarios",
    guidance:
      "Datos, métricas y simulaciones, con límites de revisión para evitar sobrecontrol. Evita ambigüedad y mensajes básicos.",
    userSummary: "Quieres datos, control y precisión para optimizar cada decisión.",
  },
  creador: {
    label: "Creador de Estilo de Vida",
    recommendedTone: "aspiracional, elegante y retador",
    initialFocus: "metas aspiracionales con patrimonio primero y lujo sostenible",
    guidance:
      "Sin vergüenza por querer experiencias premium; controla la inflación de estilo de vida. Primero arquitectura, luego decoración.",
    userSummary: "Quieres vivir mejor hoy, construyendo un estilo de vida sostenible.",
  },
  guardian: {
    label: "Guardián Familiar",
    recommendedTone: "responsable, protector y claro",
    initialFocus: "protección familiar, seguros y metas compartidas",
    guidance:
      "Decide pensando en los suyos: protección antes que estrategias agresivas. Evita recomendaciones individualistas.",
    userSummary: "Quieres proteger y cuidar a quienes amas con buenas decisiones.",
  },
  constructor: {
    label: "Constructor de Futuro",
    recommendedTone: "estratégico, retador y de alto nivel",
    initialFocus: "tasa de inversión, aportes recurrentes y patrimonio a largo plazo",
    guidance:
      "Consistencia y permanencia; escenarios a 5/10/20 años y recordatorios anti-FOMO. Evita explicaciones demasiado básicas.",
    userSummary:
      "Quieres que tu dinero construya futuro: crecer, invertir y avanzar con consistencia.",
  },
};
