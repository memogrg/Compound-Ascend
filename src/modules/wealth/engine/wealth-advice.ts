/**
 * Recomendación del asesor sobre el patrimonio (pura, determinista, testeable).
 * Recibe analytics ya calculados y devuelve una nota corta en 2ª persona, o null
 * si no hay perfil (sin arquetipo) para que la página decida no mostrarla.
 */

export type WealthAdvice = { title: string; body: string; accent: "pos" | "warn" | "neg" };

const noFund = (f?: string): boolean => f === "no" || f === "no_se";

/** Cierre opcional por arquetipo (sin punto final; el cuerpo lo añade). */
function archetypeTail(archetypeLabel?: string): string {
  const l = (archetypeLabel ?? "").toLowerCase();
  if (l.includes("constructor") || l.includes("estratega")) return " Piensa en escenarios a 5/10/20 años";
  if (l.includes("protector") || l.includes("guard")) return " manteniendo siempre tu base segura";
  return "";
}

export function buildWealthAdvice(p: {
  archetypeLabel?: string;
  riskClass?: string;
  hasEmergencyFund?: string;
  dominantValue?: string;
  value: number;
  topLabel?: string;
  topPct?: number; // 0-1
  holdingsCount: number;
}): WealthAdvice | null {
  if (!p.archetypeLabel) return null;

  // 1) Aún no invierte.
  if (p.holdingsCount === 0 || p.value <= 0) {
    if (noFund(p.hasEmergencyFund)) {
      return {
        accent: "warn",
        title: "Primero tu base, luego crecer",
        body: "Antes de invertir, asegura tu fondo de emergencia: es lo que te deja invertir tranquilo, sin tener que vender en mal momento.",
      };
    }
    return {
      accent: "pos",
      title: "Listo para dar el paso",
      body: `Tienes una base. Empezar a invertir de forma gradual y recurrente es tu próxima jugada hacia ${p.dominantValue ?? "tus metas"}.`,
    };
  }

  // 2) Cartera concentrada.
  if (p.topPct != null && p.topPct >= 0.7) {
    return {
      accent: "warn",
      title: "Tu cartera está concentrada",
      body: `${p.topLabel ?? "Una sola clase"} pesa ${Math.round(p.topPct * 100)}% de tu portafolio. Diversificar reduce el golpe si esa clase cae, sin renunciar al crecimiento.`,
    };
  }

  // 3) Perfil de crecimiento pero colchón delgado.
  if ((p.riskClass === "crecimiento" || p.riskClass === "agresivo") && noFund(p.hasEmergencyFund)) {
    return {
      accent: "warn",
      title: "Crece con base",
      body: "Tu perfil tolera crecer, pero tu colchón aún es delgado. Asegura tu fondo de emergencia para sostener tu estrategia sin sustos.",
    };
  }

  // 4) Todo en orden.
  return {
    accent: "pos",
    title: "Vas por buen camino",
    body: `Tu cartera está en marcha. Lo que más mueve la aguja ahora: aportes recurrentes y medir tu patrimonio cada mes.${archetypeTail(p.archetypeLabel) ? archetypeTail(p.archetypeLabel) + "." : ""}`,
  };
}
