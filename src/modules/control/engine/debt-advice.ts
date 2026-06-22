/**
 * Recomendación del asesor sobre deudas (pura, determinista, testeable). Recibe
 * datos ya cargados y devuelve una nota corta en 2ª persona, o null si no hay
 * perfil (sin arquetipo) para que la página decida no mostrarla.
 */

type AdviceDebt = {
  name: string;
  balance: number;
  apr: number | null;
  delinquency?: string | null;
};

export type DebtAdvice = {
  title: string;
  body: string;
  accent: "pos" | "warn" | "neg";
};

/** Cierre opcional por arquetipo (sin punto final; el cuerpo lo añade). */
function archetypeTail(archetypeLabel?: string): string {
  const l = (archetypeLabel ?? "").toLowerCase();
  if (l.includes("protector") || l.includes("guard")) return " sin comprometer tu fondo de emergencia";
  if (l.includes("constructor") || l.includes("estratega")) return " para acelerar tu inversión";
  return "";
}

export function buildDebtAdvice(p: {
  archetypeLabel?: string;
  tone?: string;
  dominantValue?: string;
  debts: AdviceDebt[];
}): DebtAdvice | null {
  // Sin perfil no mostramos la nota (la página lo decide con el null).
  if (!p.archetypeLabel) return null;

  const value = p.dominantValue ?? "tu patrimonio";
  const active = p.debts.filter((d) => d.balance > 0);

  // 1) Sin deudas activas.
  if (active.length === 0) {
    return {
      accent: "pos",
      title: "Sin deudas activas — buen cimiento",
      body: `Es una base fuerte. Cada colón que antes iría a intereses ahora puede construir ${value}.`,
    };
  }

  // 2) Alguna en atraso → prioridad absoluta.
  const late = active.find(
    (d) => d.delinquency === "1_30" || d.delinquency === "31_60" || d.delinquency === "60_mas",
  );
  if (late) {
    return {
      accent: "neg",
      title: `Atención: "${late.name}" está en atraso`,
      body: "Ponerte al día con esta deuda es la prioridad: evita que crezca por intereses y cargos. El resto del plan espera.",
    };
  }

  // 3) Ataca primero la de mayor APR.
  const topDebt = active.reduce((a, b) => ((b.apr ?? 0) > (a.apr ?? 0) ? b : a));
  const aprLabel = topDebt.apr !== null ? `${topDebt.apr}%` : "la más cara";
  return {
    accent: "warn",
    title: "Tu próxima jugada con tus deudas",
    body: `Ataca primero "${topDebt.name}" (${aprLabel}): es la que más te cuesta. Cada pago la reduce y libera flujo hacia ${p.dominantValue ?? "tus metas"}${archetypeTail(p.archetypeLabel)}.`,
  };
}
