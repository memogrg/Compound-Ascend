/**
 * Genera insights y la "próxima mejor acción" del panel a partir de los
 * indicadores de la Base y la salud financiera. Determinista (la IA puede
 * reescribir el tono después). Tono humano, sin culpa, siempre con el porqué.
 */
import type { BaseIndicators } from "@/modules/financial-base";
import type { HealthScore } from "@/modules/financial-base";
import { formatMoney } from "@/lib/format";
import type { DashboardKpis } from "@/modules/dashboard/engine/kpis";

export type Insight = { h: string; d: string };
export type DashboardInsights = { nextBestAction: string; insights: Insight[] };

/**
 * @param kpis  Los KPIs canónicos del panel. Cuando llegan, el flujo, la deuda y el ahorro
 *              salen de los MOTORES UNIFICADOS (los mismos números que las tarjetas), no
 *              de los indicadores del presupuesto. Sin ellos degrada a `ind`, que es lo
 *              que consumen los tests puros y la vista demo.
 */
export function buildInsights(
  ind: BaseIndicators,
  health: HealthScore,
  currency: string,
  kpis?: DashboardKpis,
): DashboardInsights {
  const insights: Insight[] = [];
  // Una fuente por métrica: si el KPI existe manda él; el indicador del presupuesto es
  // el respaldo, no una segunda verdad.
  const flujoLibre = kpis?.flujo?.real ?? ind.freeCashflow;
  const pesoDeuda = kpis?.deudas?.dti ?? ind.debtWeight;
  const tasaAhorro = kpis?.ahorro?.tasa ?? ind.savingsRate;

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
  if (flujoLibre < 0) {
    insights.push({
      h: "Flujo negativo este mes",
      d: `Gastas ${formatMoney(Math.abs(flujoLibre), currency)} más de lo que ingresas. Prioriza pausar gastos flexibles y evitar nuevas deudas.`,
    });
  } else {
    insights.push({
      h: "Tienes margen de maniobra",
      d: `Te quedan ${formatMoney(flujoLibre, currency)} libres al mes. Podemos dirigirlos a tus metas o a reducir deuda cara.`,
    });
  }

  // Deuda
  if (pesoDeuda >= 0.3) {
    insights.push({
      h: "Tu deuda pesa",
      d: `Las deudas consumen el ${Math.round(pesoDeuda * 100)}% de tu ingreso. Reducirlas liberará flujo y bajará tu presión financiera.`,
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
  if (tasaAhorro < 0.1 && flujoLibre >= 0) {
    insights.push({
      h: "Tu ahorro puede crecer",
      d: `Ahorras el ${Math.round(tasaAhorro * 100)}% de tu ingreso. Subirlo de forma gradual acelera tus objetivos.`,
    });
  }

  const nextBestAction = chooseNextAction({ flujoLibre, pesoDeuda, tasaAhorro });
  return { nextBestAction, insights: insights.slice(0, 3) };
}

function chooseNextAction(m: {
  flujoLibre: number;
  pesoDeuda: number;
  tasaAhorro: number;
}): string {
  if (m.flujoLibre < 0) {
    return "Detén la fuga: revisa tus gastos flexibles para volver a flujo positivo antes de cualquier otra meta.";
  }
  if (m.pesoDeuda >= 0.3) {
    return "Dirige tu flujo libre a tu deuda de mayor costo este mes.";
  }
  if (m.tasaAhorro < 0.1) {
    return "Automatiza un ahorro mensual para construir tu fondo de emergencia.";
  }
  return "Vas bien: considera convertir parte de tu ahorro en inversión de largo plazo según tu perfil.";
}
