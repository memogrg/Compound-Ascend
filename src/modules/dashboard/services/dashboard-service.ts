import "server-only";

/** Reúne los datos del panel desde los módulos disponibles. */
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import {
  getBaseSummary,
  getDisplayCurrency,
} from "@/modules/financial-base/services/base-service";
import { computeBaseIndicators } from "@/modules/financial-base/engine/base-engine";
import { computeHealthScore, type HealthScore } from "@/modules/financial-base/engine/health";
import { buildInsights, type DashboardInsights } from "@/modules/dashboard/engine/insights";
import type { BaseSummary } from "@/modules/financial-base/services/base-service";
import type { IncomeSource, ExpenseItem } from "@/modules/financial-base/types";

export type DashboardData = {
  name: string;
  currency: string;
  summary: BaseSummary;
  health: HealthScore;
  insights: DashboardInsights;
  configured: boolean;
};

export async function getDashboardData(): Promise<DashboardData> {
  const configured = isSupabaseConfigured();
  const user = await getUser();
  const name =
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "bienvenido";

  let summary: BaseSummary;
  let currency = "CRC";
  if (configured) {
    [summary, currency] = await Promise.all([getBaseSummary(), getDisplayCurrency()]);
  } else {
    // Modo demostración (sin Supabase): datos de ejemplo claramente etiquetados
    // en la UI, para previsualizar el panel premium. Se reemplazan por datos
    // reales al conectar Supabase y capturar tu base.
    summary = buildDemoSummary();
  }

  // Pasa la tasa de inversión activa para que contribuya al health score.
  const health = computeHealthScore(summary.indicators, summary.indicators.investmentRate);
  const insights = buildInsights(summary.indicators, health, currency);

  return { name, currency, summary, health, insights, configured };
}

function demoIncome(name: string, type: IncomeSource["incomeType"], m: number): IncomeSource {
  return {
    id: name,
    name,
    incomeType: type,
    amount: m,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    includeInBudget: true,
    amountMonthly: m,
  };
}
function demoExpense(name: string, nature: ExpenseItem["nature"], m: number): ExpenseItem {
  return {
    id: name,
    name,
    nature,
    amount: m,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    amountMonthly: m,
  };
}

function buildDemoSummary(): BaseSummary {
  const incomes: IncomeSource[] = [
    demoIncome("Salario", "activo", 850_000),
    demoIncome("Alquiler apartamento", "pasivo", 250_000),
  ];
  const expenses: ExpenseItem[] = [
    demoExpense("Vivienda", "esencial", 300_000),
    demoExpense("Alimentación", "esencial", 180_000),
    demoExpense("Tarjeta de crédito", "financiero", 140_000),
    demoExpense("Suscripciones", "estilo_vida", 35_000),
    demoExpense("Inversión mensual", "inversion", 120_000),
    demoExpense("Fondo de emergencia", "ahorro", 90_000),
    demoExpense("Seguro médico", "proteccion", 60_000),
  ];
  return { indicators: computeBaseIndicators(incomes, expenses), incomes, expenses };
}
