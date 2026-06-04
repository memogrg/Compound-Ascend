/**
 * Puntuación de salud financiera (0-100) a partir de los indicadores de la Base.
 * Pura y testeable. A medida que existan Control/Patrimonio se incorporan más
 * dimensiones (protección, emergencia, diversificación) — hoy se calcula con lo
 * disponible y se marca el resto como pendiente.
 */
import type { BaseIndicators } from "@/modules/financial-base/types";

export type HealthGrade = "SÓLIDA" | "BUENA" | "EN PROGRESO" | "FRÁGIL";

export type HealthBar = { label: string; ratio: number; display: string; color: string };

export type HealthScore = {
  score: number; // 0-100
  grade: HealthGrade;
  bars: HealthBar[];
  hasData: boolean;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * @param ind              Indicadores de la base financiera.
 * @param investmentRate   Tasa de inversión activa (0-1). Cuando está presente,
 *                         aporta hasta +5 pts bonus al score (capeado en 100).
 *                         Implementa la dimensión patrimonial descrita en el
 *                         comentario original de este motor.
 */
export function computeHealthScore(ind: BaseIndicators, investmentRate?: number): HealthScore {
  const hasData = ind.incomeMonthly > 0 || ind.expenseMonthly > 0;

  // Tasa de ahorro: meta 20% → 30 pts.
  const savingsPts = clamp01(ind.savingsRate / 0.2) * 30;
  // Ratio de deuda: menor es mejor; 0% → 25 pts, ≥50% → 0.
  const debtPts = (1 - clamp01(ind.debtWeight / 0.5)) * 25;
  // Flujo libre positivo: 25 pts si positivo, proporcional si negativo.
  const free = ind.incomeMonthly > 0 ? ind.freeCashflow / ind.incomeMonthly : 0;
  const cashPts = clamp01((free + 0.2) / 0.4) * 25;
  // Gastos esenciales: meta ≤60% → 20 pts; ≥100% → 0.
  const essPts = (1 - clamp01((ind.essentialsWeight - 0.6) / 0.4)) * 20;
  // Bonus de inversión activa: invertir ≥10% del ingreso = +5 pts.
  const invBonus =
    investmentRate !== undefined ? clamp01(investmentRate / 0.1) * 5 : 0;

  const score = hasData
    ? Math.min(100, Math.round(savingsPts + debtPts + cashPts + essPts + invBonus))
    : 0;

  const grade: HealthGrade =
    score >= 80 ? "SÓLIDA" : score >= 60 ? "BUENA" : score >= 40 ? "EN PROGRESO" : "FRÁGIL";

  const bars: HealthBar[] = [
    {
      label: "Tasa de ahorro",
      ratio: clamp01(ind.savingsRate / 0.3),
      display: `${Math.round(ind.savingsRate * 100)}%`,
      color: "var(--c-savings)",
    },
    {
      label: "Ratio de deuda",
      ratio: clamp01(ind.debtWeight / 0.5),
      display: `${Math.round(ind.debtWeight * 100)}%`,
      color: "var(--c-debt)",
    },
    {
      label: "Gastos esenciales",
      ratio: clamp01(ind.essentialsWeight),
      display: `${Math.round(ind.essentialsWeight * 100)}%`,
      color: "var(--c-expense)",
    },
    {
      label: "Flujo libre",
      ratio: clamp01((free + 0.2) / 0.4),
      display: ind.freeCashflow >= 0 ? "Positivo" : "Negativo",
      color: ind.freeCashflow >= 0 ? "var(--c-income)" : "var(--neg)",
    },
  ];

  return { score, grade, bars, hasData };
}
