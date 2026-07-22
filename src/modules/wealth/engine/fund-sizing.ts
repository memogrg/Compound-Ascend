/**
 * Dimensionamiento de los FONDOS DE DEFENSA (emergencia + paz). Puro, determinista, sin IO.
 *
 * Modelo (definido con David):
 *  - Emergencia = $1.000 fijo (colchón de arranque para un imprevisto puntual), convertido a
 *    la moneda principal. Recomendado; editable a futuro.
 *  - Paz = N × gasto esencial mensual (N elegido por el usuario, 3-6, default 3). El gasto
 *    esencial YA excluye los aportes a los propios fondos de defensa (anti-circularidad; ver
 *    getEssentialMonthlyExpense({ excludeDefenseFunds: true })).
 *  - Hito: EMERGENCIA primero (prioridad 1); mientras no esté cubierta, no se recomienda
 *    aportar a paz todavía.
 *
 * La app informa, no ordena: esto solo dice objetivo, brecha y cuánto apartar/mes; el usuario
 * decide. Ningún número es una promesa.
 */
import { convertCurrency } from "@/lib/fx";

/** Colchón de arranque fijo, en USD. Se convierte a la moneda principal del usuario. */
export const EMERGENCY_FUND_USD = 1000;

/** Meses de gasto esencial para el fondo de paz: default y rango permitido. */
export const PEACE_MONTHS_DEFAULT = 3;
export const PEACE_MONTHS_MIN = 3;
export const PEACE_MONTHS_MAX = 6;

/** Horizonte por defecto para cerrar la brecha (meses). Recomendación = brecha / horizonte. */
export const FUND_HORIZON_MONTHS = 12;

/** goal_types de los fondos de defensa (para leer el acumulado y excluir de la circularidad). */
export const DEFENSE_FUND_GOAL_TYPES = ["defensa:fondo_emergencia", "defensa:fondo_paz"] as const;
export function isDefenseFundGoalType(goalType: string | null | undefined): boolean {
  return !!goalType && (DEFENSE_FUND_GOAL_TYPES as readonly string[]).includes(goalType);
}

export type FundSizing = {
  /** Objetivo en moneda principal (≥0). */
  target: number;
  /** Acumulado actual en moneda principal (≥0). */
  current: number;
  /** Brecha por cerrar (target − current), nunca negativa. */
  gap: number;
  /** Progreso 0-1 (topeado en 1). */
  progressPct: number;
  /** ¿Ya está cubierto (current ≥ target)? */
  covered: boolean;
  /** Cuánto apartar por mes para cerrar la brecha en el horizonte (0 si cubierto). */
  recommendedMonthly: number;
};

export type DefenseFundsPlan = {
  emergency: FundSizing;
  peace: FundSizing & { months: number; blockedByEmergency: boolean };
  /** Cuál es el fondo activo del hito ahora mismo. */
  activeFund: "emergency" | "peace" | "done";
  horizonMonths: number;
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Cuántos meses de gasto esencial cubre el acumulado actual del fondo de paz. */
export function monthsCovered(current: number, essentialMonthly: number): number {
  return essentialMonthly > 0 ? Math.max(0, current) / essentialMonthly : 0;
}

/** Umbral de "obligación de largo plazo" (hipoteca): plazo ≥ 10 años. */
export const LONG_TERM_DEBT_MONTHS = 120;

export type DebtSignal = {
  classification?: string | null;
  termMonths?: number | null;
  debtType?: string | null;
  balance: number;
};

/**
 * Detecta el CASO CLAVE del fondo de paz: el usuario NO tiene deuda crítica (salió de deudas
 * de consumo) PERO sí una obligación FIJA de largo plazo (hipoteca: plazo alto o tipo hipoteca)
 * que sigue si su ingreso se detiene → por eso necesita la reserva aunque "ya no deba tarjetas".
 */
export function detectLongTermObligation(debts: DebtSignal[]): boolean {
  const active = debts.filter((d) => d.balance > 0);
  const hasCritical = active.some((d) => d.classification === "critica");
  const hasLongTerm = active.some(
    (d) =>
      (d.termMonths ?? 0) >= LONG_TERM_DEBT_MONTHS ||
      /hipotec|vivienda|casa|inmueble/i.test(d.debtType ?? ""),
  );
  return hasLongTerm && !hasCritical;
}

/** Dimensiona un fondo: brecha, progreso, cobertura y recomendación mensual. Puro. */
export function sizeFund(target: number, current: number, horizonMonths: number): FundSizing {
  const t = Math.max(0, Number.isFinite(target) ? target : 0);
  const cur = Math.max(0, Number.isFinite(current) ? current : 0);
  const gap = Math.max(0, t - cur);
  const covered = cur >= t;
  const progressPct = t > 0 ? Math.min(1, cur / t) : 1; // target 0 = cubierto
  const recommendedMonthly = covered || horizonMonths <= 0 ? 0 : gap / horizonMonths;
  return { target: t, current: cur, gap, progressPct, covered, recommendedMonthly };
}

/** $1.000 (EMERGENCY_FUND_USD) expresado en `currency`, usando la tabla de tasas. */
export function emergencyTargetIn(currency: string, rates: Record<string, number>): number {
  return convertCurrency(EMERGENCY_FUND_USD, "USD", currency, rates);
}

/**
 * Plan de los dos fondos de defensa. `essentialMonthly` debe venir SIN los aportes a los
 * propios fondos de defensa (anti-circularidad). Todos los montos en la MISMA moneda.
 */
export function computeDefenseFunds(input: {
  emergencyTarget: number; // en moneda principal ($1.000 convertido)
  emergencyCurrent: number;
  peaceMonths: number;
  essentialMonthly: number; // SIN aportes a los fondos de defensa
  peaceCurrent: number;
  horizonMonths?: number;
}): DefenseFundsPlan {
  const horizon = input.horizonMonths ?? FUND_HORIZON_MONTHS;
  const emergency = sizeFund(input.emergencyTarget, input.emergencyCurrent, horizon);

  const months = clamp(Math.round(input.peaceMonths), PEACE_MONTHS_MIN, PEACE_MONTHS_MAX);
  const peaceTarget = months * Math.max(0, input.essentialMonthly);
  const peaceBase = sizeFund(peaceTarget, input.peaceCurrent, horizon);

  // Hito: EMERGENCIA primero. Mientras no esté cubierta, no se recomienda aportar a paz.
  const blockedByEmergency = !emergency.covered;
  const peace = {
    ...peaceBase,
    recommendedMonthly: blockedByEmergency ? 0 : peaceBase.recommendedMonthly,
    months,
    blockedByEmergency,
  };

  const activeFund: DefenseFundsPlan["activeFund"] = !emergency.covered
    ? "emergency"
    : !peace.covered
      ? "peace"
      : "done";

  return { emergency, peace, activeFund, horizonMonths: horizon };
}
