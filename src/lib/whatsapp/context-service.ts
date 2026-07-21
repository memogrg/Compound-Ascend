import "server-only";
import { householdMemberIds } from "@/lib/household/active";

/**
 * Construye el FinancialContext AUTORIZADO del usuario/hogar para el bot, con
 * service-role (solo lectura) ya que el webhook no tiene sesión. Limita los
 * datos al hogar del usuario; nunca de otros.
 *
 * Paridad con la web: además de los 5 campos base (nombre, moneda, ingreso,
 * gasto, flujo libre), enriquece el contexto con Marco Patrimonial, patrimonio
 * neto, metas, deudas y perfil — cada bloque best-effort en su try/catch (mismo
 * patrón que context-engine.ts). Si TODO el enriquecimiento falla, sigue
 * devolviendo al menos los 5 campos base. Los montos se normalizan a la moneda
 * PRINCIPAL (misma disciplina FX que tool-context.ts). Sin soporte de ctx (se
 * dejan undefined): portafolio, insights, entidades vinculables, entorno macro.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getUserCurrency, getUserDisplayName } from "@/lib/whatsapp/links-service";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { getPatrimonioReportForUser } from "@/modules/wealth/services/patrimonio-service";
import { aggregateNetWorth } from "@/modules/rich-life/services/rich-life-service";
import { computeWealthBreakdown } from "@/lib/ai/wealth-breakdown";
import { normalizeDebtsForTool, type FinancialContext } from "@/lib/ai/orchestrator";
import { readProfileContext } from "@/lib/whatsapp/wa-profile-context";
import { computeTrajectory } from "@/lib/ai/trajectory";

function sumMonthly(rows: { amount_monthly_base: number | null }[] | null): number {
  return (rows ?? []).reduce((acc, r) => acc + Number(r.amount_monthly_base ?? 0), 0);
}

type DebtRow = {
  id: string;
  name: string;
  balance: number | string;
  apr: number | string | null;
  min_payment: number | string | null;
  currency: string;
};

export async function buildContextForUser(
  userId: string,
  householdId: string | null,
): Promise<FinancialContext> {
  const supabase = createServiceRoleClient();
  const memberIds = await householdMemberIds(supabase, userId);
  const [name, currency] = await Promise.all([getUserDisplayName(userId), getUserCurrency(userId)]);
  const primary = currency; // user_settings.primary_currency (default CRC)

  // ── Campos base (como hoy): ingreso/gasto/flujo libre del usuario u hogar. ──
  const orFilter = householdId
    ? `user_id.eq.${userId},household_id.eq.${householdId}`
    : `user_id.eq.${userId}`;
  const [{ data: inc }, { data: exp }] = await Promise.all([
    supabase.from("income_sources").select("amount_monthly_base").or(orFilter),
    supabase.from("expense_items").select("amount_monthly_base, nature, currency").or(orFilter),
  ]);
  const incomeMonthly = sumMonthly(inc);
  const expenseMonthly = sumMonthly(exp);

  const ctx: FinancialContext = {
    name: name || undefined,
    currency,
    incomeMonthly,
    expenseMonthly,
    freeCashflow: incomeMonthly - expenseMonthly,
  };
  if (incomeMonthly > 0)
    ctx.savingsRatePct = Math.round(((incomeMonthly - expenseMonthly) / incomeMonthly) * 100);
  // Fuentes de ingreso activas (para señalar concentración si es una sola).
  ctx.incomeSourceCount = (inc ?? []).filter((r) => Number(r.amount_monthly_base ?? 0) > 0).length;

  // FX una sola vez, compartido por Marco Patrimonial, deudas y gasto más pesado. Best-effort.
  let rates: Record<string, number> | null = null;
  try {
    rates = await getFxRates();
  } catch {
    rates = null;
  }

  // ── Gasto más pesado por naturaleza (normalizado a la principal con FX). ──
  try {
    const byNature = new Map<string, number>();
    for (const e of exp ?? []) {
      const raw = Number(e.amount_monthly_base ?? 0);
      if (!(raw > 0)) continue;
      const cur = String(e.currency ?? primary);
      const nature = String(e.nature ?? "miscelaneo");
      const val = rates && cur !== primary ? convertCurrency(raw, cur, primary, rates) : raw;
      byNature.set(nature, (byNature.get(nature) ?? 0) + val);
    }
    let topName: string | null = null;
    let topVal = 0;
    let total = 0;
    for (const [nature, val] of byNature) {
      total += val;
      if (val > topVal) {
        topVal = val;
        topName = nature;
      }
    }
    if (topName && total > 0) {
      ctx.topExpenseCategory = {
        name: topName.replaceAll("_", " "),
        monthly: Math.round(topVal),
        pct: Math.round((topVal / total) * 100),
      };
    }
  } catch {
    // Gasto más pesado no disponible.
  }

  // ── 1) Marco Patrimonial (service-role, normalizado a la principal). ──
  try {
    const pat = await getPatrimonioReportForUser(userId);
    // Conversión defensiva: normalmente pat.currency === primary; si difieren y no
    // hay FX, los MONTOS quedan undefined (las métricas unitless sí se pueblan).
    const conv = (n: number): number =>
      pat.currency === primary ? n : rates ? convertCurrency(n, pat.currency, primary, rates) : NaN;

    // Métricas sin unidad monetaria: se pueblan siempre que haya reporte.
    ctx.indicePatrimonial = Math.round(pat.report.indice);
    ctx.nivelPatrimonial = pat.level.name;
    ctx.añosDeLibertad = Math.round(pat.report.añosDeLibertad);
    ctx.mesesDeColchon = Math.round(pat.report.mesesDeColchon);
    ctx.coberturaPasivaPct = Math.round(pat.report.coberturaPasiva * 100);
    ctx.calidadPatrimonio = Math.round(pat.report.calidadPatrimonio);
    ctx.patrimonioDiagnosis = pat.diagnosis.map((d) => d.code);

    // Montos: solo si la conversión a la principal fue posible. El número de
    // INDEPENDENCIA (vida actual) siempre existe; el de libertad (deseado) es
    // opcional y se omite si el usuario no lo definió.
    const indep = conv(pat.report.numeroDeIndependencia);
    const invertible = conv(pat.report.investableWealth);
    if (Number.isFinite(indep)) ctx.numeroDeIndependencia = Math.round(indep);
    if (pat.report.numeroDeLibertad != null) {
      const lib = conv(pat.report.numeroDeLibertad);
      if (Number.isFinite(lib)) ctx.numeroDeLibertad = Math.round(lib);
    }
    if (Number.isFinite(invertible)) ctx.investableWealth = Math.round(invertible);
  } catch {
    // Marco Patrimonial no disponible.
  }

  // ── 2) Patrimonio neto (ya normalizado a la principal por aggregateNetWorth). ──
  try {
    const agg = await aggregateNetWorth({ db: supabase, userId });
    const totalAssets = agg.assets.reduce((s, a) => s + a.value, 0);
    const totalLiabilities = agg.liabilities.reduce((s, l) => s + l.balance, 0);
    ctx.netWorth = Math.round(totalAssets - totalLiabilities);
    // Desglose invertido/líquido/otros reusando ESTE mismo set de activos (sin llamada extra).
    ctx.wealthBreakdown = computeWealthBreakdown(agg.assets);
  } catch {
    // Patrimonio neto no disponible.
  }

  // ── 3) Metas: cuántas y avance agregado (ratio, igual que la web). ──
  try {
    const { data: goals } = await supabase
      .from("savings_goals")
      .select("current_amount,target_amount")
      .in("user_id", memberIds);
    if (goals && goals.length > 0) {
      const target = goals.reduce((s, g) => s + Number(g.target_amount), 0);
      const current = goals.reduce((s, g) => s + Number(g.current_amount), 0);
      ctx.goalCount = goals.length;
      if (target > 0) ctx.goalsProgressPct = current / target;
    }
  } catch {
    // Metas no disponibles.
  }

  // ── 4) Deudas: total/cantidad/la más cara, normalizadas a la principal (FX
  // compartida vía normalizeDebtsForTool, sin duplicar la lógica de conversión). ──
  try {
    const { data: debtRows } = await supabase
      .from("debts")
      .select("id, name, balance, apr, min_payment, currency")
      .in("user_id", memberIds);
    const raw = ((debtRows ?? []) as DebtRow[])
      .map((d) => ({
        id: d.id,
        name: d.name,
        balance: Number(d.balance),
        minPayment: Number(d.min_payment ?? 0),
        apr: d.apr === null ? null : Number(d.apr),
        currency: d.currency,
      }))
      .filter((d) => d.balance > 0);
    if (raw.length > 0) {
      const normalized = normalizeDebtsForTool(raw, primary, rates);
      ctx.debtCount = raw.length;
      ctx.debtTotal = Math.round(normalized.reduce((s, d) => s + d.balance, 0));
      // La más cara por TAE (unitless): se elige sobre las crudas para preservar
      // apr null → topDebtApr undefined (misma semántica que la web).
      const top = raw.reduce((a, b) => ((a.apr ?? 0) >= (b.apr ?? 0) ? a : b));
      ctx.topDebtName = top.name;
      ctx.topDebtApr = top.apr ?? undefined;
    }
  } catch {
    // Deudas no disponibles.
  }

  // ── 5) Perfil: preocupación, arquetipo + tono, riesgo, disciplina, etc. ──
  try {
    Object.assign(ctx, await readProfileContext(supabase, userId));
  } catch {
    // Perfil no disponible.
  }

  // ── 6) Trayectoria (memoria longitudinal): lectura service-role de snapshots + motor puro.
  // getSnapshotHistory no acepta ctx, así que leemos directo por user_id. Mismo motor que la web. ──
  try {
    const [{ data: ms }, { data: ps }] = await Promise.all([
      supabase
        .from("monthly_snapshots")
        .select("period,income_monthly,expense_monthly,free_cashflow")
        .in("user_id", memberIds)
        .order("period", { ascending: false })
        .limit(6),
      supabase
        .from("portfolio_snapshots")
        .select("date,portfolio_value,net_worth")
        .in("user_id", memberIds)
        .order("date", { ascending: false })
        .limit(60),
    ]);
    const monthly = (ms ?? [])
      .map((r) => ({
        period: String(r.period),
        income: Number(r.income_monthly),
        expense: Number(r.expense_monthly),
        freeCashflow: Number(r.free_cashflow),
      }))
      .reverse(); // a cronológico ascendente
    const portfolio = (ps ?? [])
      .map((r) => ({
        date: String(r.date),
        portfolioValue: Number(r.portfolio_value),
        netWorth: Number(r.net_worth),
      }))
      .reverse();
    ctx.trajectory = computeTrajectory(monthly, portfolio);
  } catch {
    // Trayectoria no disponible.
  }

  return ctx;
}
