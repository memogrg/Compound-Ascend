/**
 * Genera insights y la "próxima mejor acción" del panel a partir de los
 * indicadores de la Base y la salud financiera. Determinista (la IA puede
 * reescribir el tono después). Tono humano, sin culpa, siempre con el porqué.
 */
import type { BaseIndicators } from "@/modules/financial-base/types";
import type { HealthScore } from "@/modules/financial-base/engine/health";
import { formatMoney } from "@/lib/format";

export type Insight = { h: string; d: string };
export type DashboardInsights = { nextBestAction: string; insights: Insight[] };

export function buildInsights(
  ind: BaseIndicators,
  health: HealthScore,
  currency: string,
): DashboardInsights {
  const insights: Insight[] = [];

  if (!health.hasData) {
    return {
      nextBestAction:
        "Agrega tu ingreso principal y tus gastos esenciales para recibir tu primer diagnóstico.",
      insights: [
        {
          h: "Construye tu base",
          d: "Con tus ingresos y gastos calcularemos tu flujo libre, tus tasas y tu próxima mejor acción.",
        },
      ],
    };
  }

  // Flujo libre
  if (ind.freeCashflow < 0) {
    insights.push({
      h: "Flujo negativo este mes",
      d: `Gastas ${formatMoney(Math.abs(ind.freeCashflow), currency)} más de lo que ingresas. Prioriza pausar gastos flexibles y evitar nuevas deudas.`,
    });
  } else {
    insights.push({
      h: "Tienes margen de maniobra",
      d: `Te quedan ${formatMoney(ind.freeCashflow, currency)} libres al mes. Podemos dirigirlos a tus metas o a reducir deuda cara.`,
    });
  }

  // Deuda
  if (ind.debtWeight >= 0.3) {
    insights.push({
      h: "Tu deuda pesa",
      d: `Las deudas consumen el ${Math.round(ind.debtWeight * 100)}% de tu ingreso. Reducirlas liberará flujo y bajará tu presión financiera.`,
    });
  }

  // Gastos anuales no mensualizados
  if (ind.annualCoverage > 0) {
    insights.push({
      h: "Gastos que llegan de sorpresa",
      d: `Reserva ${formatMoney(ind.annualCoverage, currency)} al mes para gastos no mensuales y evita usar deuda cuando lleguen.`,
    });
  }

  // Ahorro
  if (ind.savingsRate < 0.1 && ind.freeCashflow >= 0) {
    insights.push({
      h: "Tu ahorro puede crecer",
      d: `Ahorras el ${Math.round(ind.savingsRate * 100)}% de tu ingreso. Subirlo de forma gradual acelera tus objetivos.`,
    });
  }

  const nextBestAction = chooseNextAction(ind, currency);
  return { nextBestAction, insights: insights.slice(0, 3) };
}

function chooseNextAction(ind: BaseIndicators, currency: string): string {
  if (ind.freeCashflow < 0) {
    return "Detén la fuga: revisa tus gastos flexibles para volver a flujo positivo antes de cualquier otra meta.";
  }
  if (ind.debtWeight >= 0.3) {
    return `Dirige parte de tus ${formatMoney(ind.freeCashflow, currency)} libres a tu deuda de mayor costo este mes.`;
  }
  if (ind.savingsRate < 0.1) {
    return `Automatiza un ahorro mensual con parte de tus ${formatMoney(ind.freeCashflow, currency)} libres para construir tu fondo de emergencia.`;
  }
  return "Vas bien: considera convertir parte de tu ahorro en inversión de largo plazo según tu perfil.";
}
