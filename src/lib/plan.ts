/**
 * Modelo de planes y gating de funciones (módulo puro). Fuente única de verdad
 * para qué incluye cada plan.
 *
 * Tres planes de pago —Esencial+, Pro+ y Max+— más `ninguno`, que NO es un plan
 * gratuito: es el estado de una cuenta viva sin suscripción activa. Ahí caen la
 * cuenta que nunca pagó, la que canceló y el miembro de un hogar que quedó
 * huérfano porque el titular bajó de plan. Una cuenta en `ninguno` conserva
 * TODOS sus datos y puede exportarlos; lo que no puede es seguir usando la app
 * hasta que se suscriba.
 *
 * La diferencia entre planes es el NIVEL DE ACOMPAÑAMIENTO, no una lista de
 * casillas: cuánto puede trabajar My Agent C+ y cuánto de tu historia recuerda.
 */
import { PLAN_TOKEN_LIMITS } from "@/lib/ai/limits";

export type Plan = "ninguno" | "esencial" | "pro" | "max";

/** Los planes que se pueden comprar, en orden de escalera. */
export const PAID_PLANS = ["esencial", "pro", "max"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];

export function isPaidPlan(plan: Plan): plan is PaidPlan {
  return plan !== "ninguno";
}

/** Orden de la escalera: sirve para saber si un cambio es subida o bajada. */
export const PLAN_RANK: Record<Plan, number> = {
  ninguno: 0,
  esencial: 1,
  pro: 2,
  max: 3,
};

export function isUpgrade(from: Plan, to: Plan): boolean {
  return PLAN_RANK[to] > PLAN_RANK[from];
}

export function isDowngrade(from: Plan, to: Plan): boolean {
  return PLAN_RANK[to] < PLAN_RANK[from];
}

export type Feature =
  | "ai_chat"
  | "receipt_scanner"
  | "email_ingest"
  | "advanced_simulator"
  | "expert_review"
  | "investment_review"
  | "insurance_review"
  | "household"
  | "marketplace";

/**
 * Qué incluye cada plan.
 *
 * `ninguno` lo tiene todo apagado A PROPÓSITO: no es un tier gratuito
 * disimulado. El acceso a los datos propios (verlos, exportarlos, borrar la
 * cuenta) no pasa por esta tabla — nunca se le niega a nadie su propia
 * información.
 */
export const PLAN_FEATURES: Record<Plan, Record<Feature, boolean>> = {
  ninguno: {
    ai_chat: false,
    receipt_scanner: false,
    email_ingest: false,
    advanced_simulator: false,
    expert_review: false,
    investment_review: false,
    insurance_review: false,
    household: false,
    marketplace: false,
  },
  esencial: {
    ai_chat: true, // con el límite de uso del plan
    receipt_scanner: false, // la foto del recibo entra desde Pro+
    email_ingest: false, // la lectura del correo entra desde Pro+
    advanced_simulator: false,
    expert_review: false,
    investment_review: false,
    insurance_review: false,
    household: false,
    marketplace: false,
  },
  pro: {
    ai_chat: true,
    receipt_scanner: true,
    email_ingest: true,
    advanced_simulator: true,
    expert_review: false,
    investment_review: true,
    insurance_review: true,
    household: false,
    marketplace: false,
  },
  max: {
    ai_chat: true,
    receipt_scanner: true,
    email_ingest: true,
    advanced_simulator: true,
    expert_review: true,
    investment_review: true,
    insurance_review: true,
    household: true,
    marketplace: true,
  },
};

export const PLAN_LABEL: Record<Plan, string> = {
  ninguno: "Sin plan",
  esencial: "Esencial+",
  pro: "Pro+",
  max: "Max+",
};

/** Precio de referencia en dólares, para mostrar. El cobro real lo manda Stripe. */
export const PLAN_PRICE_USD: Record<PaidPlan, number> = {
  esencial: 17,
  pro: 34,
  max: 47,
};

/** Días de prueba antes del primer cobro. La tarjeta se registra al abrir la cuenta. */
export const TRIAL_DAYS = 14;

export function can(plan: Plan, feature: Feature): boolean {
  return PLAN_FEATURES[plan][feature];
}

/**
 * Personas en el hogar por plan (TOTAL, incluido el titular). Es una tabla para
 * que sumar o mover un tier sea una línea. El "usado" cuenta miembros ACTIVOS +
 * invitaciones PENDIENTES (si no, se invita de más y al aceptar se pasa).
 *
 * Solo Max+ es un plan de hogar. Esa es justamente la razón por la que existe la
 * regla de orfandad: al bajar de Max+ a cualquier otro plan, el hogar ya no cabe.
 */
export const HOUSEHOLD_MEMBER_LIMITS: Record<Plan, number> = {
  ninguno: 1,
  esencial: 1,
  pro: 1,
  max: 3,
};

export function householdMemberLimit(plan: Plan): number {
  return HOUSEHOLD_MEMBER_LIMITS[plan];
}

export function aiTokenLimit(plan: Plan): number {
  return PLAN_TOKEN_LIMITS[plan];
}

/**
 * El nivel de My Agent C+ que se muestra en cada plan. Tres tramos, igual que el
 * medidor de la landing: es lo que hace entender en tres segundos por qué el
 * precio sube.
 *
 * NO decir «ilimitado» (no está confirmado que no haya tope) ni «tokens»
 * (lenguaje técnico interno). Cuando el límite real esté definido, esto pasa a
 * «hasta X consultas o análisis al mes».
 */
export const AGENT_LEVEL: Record<PaidPlan, { nivel: string; detalle: string; tramos: number }> = {
  esencial: { nivel: "Esencial", detalle: "Uso limitado · Memoria básica", tramos: 1 },
  pro: { nivel: "Avanzado", detalle: "Mayor uso · Memoria ampliada", tramos: 2 },
  max: { nivel: "Completo", detalle: "Máxima capacidad · Memoria completa", tramos: 3 },
};

/** La promesa de cada plan, para la página de suscripción. */
export const PLAN_PROMISE: Record<PaidPlan, string> = {
  esencial: "Para tomar el control.",
  pro: "Tu asesor financiero para el día a día.",
  max: "Toda tu historia. Toda la capacidad.",
};

/** Lo que suma cada plan respecto al anterior. Se lee de arriba hacia abajo. */
export const PLAN_BENEFITS: Record<PaidPlan, string[]> = {
  esencial: [
    "My Agent C+ esencial, con memoria básica",
    "Registro por chat y manual",
    "Presupuesto, sobres y salida de deudas",
    "Tu Índice Patrimonial y tu Número de Libertad",
  ],
  pro: [
    "My Agent C+ avanzado, con memoria ampliada",
    "Foto del recibo y lectura automática del correo",
    "Simulador avanzado de escenarios",
    "Revisión de inversiones y seguros",
  ],
  max: [
    "My Agent C+ completo, con memoria de todo tu camino",
    "Hogar compartido de hasta 3 personas",
    "Acompañamiento patrimonial personalizado",
    "Acceso anticipado al marketplace curado",
  ],
};
