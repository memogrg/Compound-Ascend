import "server-only";

/**
 * Servicio de insights de inversión: orquesta datos del portafolio + perfil de
 * riesgo y genera los 5 textos de análisis mediante el motor puro.
 */
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { getBaseSummary } from "@/modules/financial-base/services/base-service";
import { buildInvestmentInsights } from "@/modules/wealth/engine/portfolio-engine";
import type { InvestmentInsights } from "@/modules/wealth/types";

export type FullInvestmentInsights = InvestmentInsights & {
  growthScore: number;
  currency: string;
};

export async function getInvestmentInsights(): Promise<FullInvestmentInsights> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [report, base, riskRow] = await Promise.all([
    getPortfolioReport(),
    getBaseSummary(),
    supabase
      .from("risk_profiles")
      .select("risk_class")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const riskClass = riskRow.data?.risk_class ?? null;

  const insights = buildInvestmentInsights(
    report.analytics,
    report.dividendAnalytics,
    riskClass,
    base.indicators.expenseMonthly,
    report.currency,
  );

  return {
    ...insights,
    growthScore: report.analytics.growthScore,
    currency: report.currency,
  };
}
