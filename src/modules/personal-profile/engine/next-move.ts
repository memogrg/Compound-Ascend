/**
 * Motor de "próxima jugada" (puro, determinista, testeable). Traduce el estado
 * financiero real del usuario en la ÚNICA siguiente acción de mayor impacto.
 * La escalera de prioridad hace que el CTA evolucione conforme el usuario avanza.
 */

export type NextMove = { title: string; body: string; cta: string; route: string };

export type FinancialState = {
  hasBase: boolean;
  hasEmergencyFund: boolean;
  hasGoals: boolean;
  hasDebts: boolean;
  hasUrgentDebt: boolean;
  hasInvestments: boolean;
  dominantValue?: string;
};

export function buildNextMove(s: FinancialState): NextMove {
  if (!s.hasBase) {
    return {
      title: "Tu próxima jugada: conocer tu realidad",
      body: "Antes de cualquier estrategia, Compound Ascend necesita tu fotografía: ingresos, gastos y tu capacidad real de inversión.",
      cta: "Construir mi Base Financiera",
      route: "/mi-base-financiera",
    };
  }
  if (s.hasUrgentDebt) {
    return {
      title: "Tu próxima jugada: frenar tu deuda en atraso",
      body: "Tienes una deuda en atraso. Ponerte al día evita que crezca por intereses; el resto del plan espera.",
      cta: "Ordenar mis deudas",
      route: "/deudas",
    };
  }
  if (!s.hasEmergencyFund) {
    return {
      title: "Tu próxima jugada: tu red de seguridad",
      body: "Un fondo de emergencia es lo que te deja avanzar sin vender en mal momento. Es tu base.",
      cta: "Crear mi fondo de emergencia",
      route: "/control-financiero",
    };
  }
  if (s.hasDebts) {
    return {
      title: "Tu próxima jugada: ordenar tus deudas",
      body: `Ataca primero la más cara. Cada pago libera flujo hacia ${s.dominantValue ?? "tus metas"}.`,
      cta: "Ver mi plan de deudas",
      route: "/deudas",
    };
  }
  if (!s.hasGoals) {
    return {
      title: "Tu próxima jugada: ponerle nombre a tu meta",
      body: "Tu dinero avanza más rápido cuando tiene un destino claro. Define tu meta #1.",
      cta: "Definir mi meta principal",
      route: "/control-financiero",
    };
  }
  if (!s.hasInvestments) {
    return {
      title: "Tu próxima jugada: que tu dinero trabaje",
      body: "Tienes base, fondo y metas. El siguiente paso es invertir, de forma gradual y recurrente.",
      cta: "Empezar a invertir",
      route: "/patrimonio",
    };
  }
  return {
    title: "Tu próxima jugada: medir y crecer",
    body: "Ya estás invirtiendo. Lo que más mueve la aguja: medir tu patrimonio cada mes y proyectar tu retiro.",
    cta: "Ver mi patrimonio",
    route: "/patrimonio",
  };
}
