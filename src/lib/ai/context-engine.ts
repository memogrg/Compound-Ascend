import "server-only";

/**
 * Motor de contexto financiero para la IA (Fase 5 · interconexión).
 *
 * Extraído de app/api/assistant/chat/route.ts y enriquecido: además de los
 * indicadores de Base Financiera y el portafolio, ahora incluye perfil
 * (preocupación principal, etapa de vida), deudas activas, metas con avance,
 * patrimonio neto y las entidades vinculables (para que la IA pueda PROPONER
 * transacciones ya vinculadas — nunca ejecutarlas).
 *
 * Cada bloque es best-effort: si una fuente falla, el contexto sigue siendo
 * útil con lo que haya. Todas las lecturas respetan RLS (cliente de sesión).
 */
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import type { FinancialContext } from "@/lib/ai/orchestrator";

export async function buildFinancialContext(): Promise<FinancialContext> {
  const user = await getUser();
  const name = (user?.user_metadata?.display_name as string | undefined) ?? undefined;
  if (!isSupabaseConfigured() || !user) return { name, currency: "CRC" };

  let ctx: FinancialContext = { name, currency: "CRC" };

  // Base Financiera: indicadores del mes.
  try {
    const { getBaseSummary, getDisplayCurrency } =
      await import("@/modules/financial-base/services/base-service");
    const [base, currency] = await Promise.all([getBaseSummary(), getDisplayCurrency()]);
    ctx = {
      ...ctx,
      currency,
      incomeMonthly: base.indicators.incomeMonthly,
      expenseMonthly: base.indicators.expenseMonthly,
      freeCashflow: base.indicators.freeCashflow,
    };
  } catch {
    // Sin base: contexto mínimo.
  }

  // Perfil: preocupación principal y etapa de vida.
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data: pp } = await supabase
      .from("personal_profiles")
      .select("main_concern,life_stage")
      .eq("user_id", user.id)
      .maybeSingle();
    if (pp?.main_concern) ctx.topConcern = String(pp.main_concern).replaceAll("_", " ");
    if (pp?.life_stage) ctx.lifeStage = String(pp.life_stage).replaceAll("_", " ");
  } catch {
    // Perfil no disponible.
  }

  // Deudas activas: total, cuántas y la más cara.
  try {
    const { listDebts } = await import("@/modules/control/services/control-service");
    const debts = (await listDebts()).filter((d) => d.balance > 0);
    if (debts.length > 0) {
      ctx.debtCount = debts.length;
      ctx.debtTotal = Math.round(debts.reduce((s, d) => s + d.balance, 0));
      const top = debts.reduce((a, b) => ((a.apr ?? 0) >= (b.apr ?? 0) ? a : b));
      ctx.topDebtName = top.name;
      ctx.topDebtApr = top.apr ?? undefined;
    }
  } catch {
    // Control no disponible.
  }

  // Metas: cuántas y avance agregado.
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    const { data: goals } = await supabase
      .from("savings_goals")
      .select("current_amount,target_amount")
      .eq("user_id", user.id);
    if (goals && goals.length > 0) {
      const target = goals.reduce((s, g) => s + Number(g.target_amount), 0);
      const current = goals.reduce((s, g) => s + Number(g.current_amount), 0);
      ctx.goalCount = goals.length;
      if (target > 0) ctx.goalsProgressPct = current / target;
    }
  } catch {
    // Metas no disponibles.
  }

  // Patrimonio neto (Rich Life) — la lectura más cara, best-effort.
  try {
    const { getRichLifeSummary } = await import("@/modules/rich-life/services/rich-life-service");
    const summary = await getRichLifeSummary();
    ctx.netWorth = Math.round(summary.snapshot.indicators.netWorth);
  } catch {
    // Rich Life no disponible.
  }

  // Portafolio (best-effort, igual que antes).
  try {
    const { getPortfolioReport } = await import("@/modules/wealth/services/portfolio-service");
    const report = await getPortfolioReport();
    if (report.analytics.totalPortfolioValue > 0) {
      const topSlice = Object.values(report.analytics.allocation).reduce((a, b) =>
        a.value > b.value ? a : b,
      );
      ctx.portfolioValue = Math.round(report.analytics.totalPortfolioValue);
      ctx.portfolioReturnPct = report.analytics.totalReturnPct;
      ctx.topAssetClass = topSlice.label;
    }
  } catch {
    // Portafolio no disponible.
  }

  // Entidades vinculables: la IA puede proponer transacciones ya vinculadas.
  try {
    const { listLinkableEntities } =
      await import("@/modules/financial-base/services/linkable-entities-service");
    const linkables = await listLinkableEntities();
    ctx.linkables = {
      debt: linkables.debt.map((e) => ({ id: e.id, name: e.name })),
      goal: linkables.goal.map((e) => ({ id: e.id, name: e.name })),
    };
  } catch {
    // Sin vinculables: la IA propone sin vínculo.
  }

  return ctx;
}
