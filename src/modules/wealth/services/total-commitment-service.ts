import "server-only";

/**
 * Fetch del COMPROMISO MENSUAL TOTAL (insumo del número de INDEPENDENCIA). Espeja
 * getEssentialMonthlyExpense pero SIN el filtro is_essential y SUMANDO metas + DCA:
 *   sobres (todos, propios) + aportes a metas + DCA de inversiones + deudas + primas.
 * Normaliza a mensual + moneda de visualización, con alcance de hogar. Delega las reglas de
 * deduplicación al engine puro computeTotalCommitment. Best-effort en el llamador (patrimonio-service).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { householdMemberIds } from "@/lib/household/active";
import { getDisplayCurrency, monthlyize, type Frequency } from "@/modules/financial-base";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { computeTotalCommitment, type CommitmentBreakdown } from "@/modules/wealth/engine/total-commitment";

export type { CommitmentBreakdown };

/**
 * Compromiso mensual total del hogar, con desglose por origen. Moneda: `opts.currency` (patrimonio
 * pasa la PRINCIPAL del reporte, para no meter el override de display en el número); por defecto la
 * de visualización.
 */
export async function getTotalMonthlyCommitment(opts?: { currency?: string }): Promise<CommitmentBreakdown> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [members, rates] = await Promise.all([householdMemberIds(supabase, user.id), getFxRates()]);
  const targetCurrency = opts?.currency ?? (await getDisplayCurrency());

  const now = new Date();
  const [budgetRows, debtRows, goalRows, policyRows, holdingRows] = await Promise.all([
    // Presupuesto del mes: TODAS las líneas de gasto (sin filtro esencial). El engine cuenta solo
    // los sobres propios (manual/recurring); las derivadas van por su entidad (regla #1).
    supabase
      .from("budget_items")
      .select("amount,currency,source_kind")
      .in("user_id", members)
      .eq("type", "expense")
      .eq("period_month", now.getMonth() + 1)
      .eq("period_year", now.getFullYear()),
    // TODAS las deudas vigentes (sin filtro esencial): cuota = current_payment (o min_payment).
    supabase.from("debts").select("current_payment,min_payment,currency").in("user_id", members).eq("is_current", true),
    // TODAS las metas: aporte mensual + policy_id (regla #2) + nombre.
    supabase.from("savings_goals").select("name,monthly_contribution,currency,policy_id").in("user_id", members),
    // TODAS las pólizas con prima: se mensualiza.
    supabase
      .from("insurance_policies")
      .select("id,policy_type,provider,premium,premium_frequency,currency")
      .in("user_id", members),
    // DCA: holdings con aporte mensual recurrente (monthly_contribution).
    supabase.from("investment_holdings").select("monthly_contribution,currency").in("user_id", members),
  ]);

  const budgetLines = (budgetRows.data ?? []).map((b) => ({
    amount: Number(b.amount),
    currency: b.currency,
    sourceKind: b.source_kind ?? "manual",
  }));

  const debts = (debtRows.data ?? []).map((d) => ({
    monthly: Number(d.current_payment) > 0 ? Number(d.current_payment) : Number(d.min_payment ?? 0),
    currency: d.currency,
  }));

  const goals = (goalRows.data ?? []).map((g) => ({
    monthly: Number(g.monthly_contribution ?? 0),
    currency: g.currency,
    policyId: g.policy_id ?? null,
    name: g.name ?? undefined,
  }));

  const policies = (policyRows.data ?? [])
    .filter((p) => p.premium != null)
    .map((p) => ({
      id: p.id,
      monthly: monthlyize(Number(p.premium), (p.premium_frequency ?? "mensual") as Frequency),
      currency: p.currency,
      name: p.policy_type ?? p.provider ?? undefined,
    }));

  const dca = (holdingRows.data ?? [])
    .filter((h) => Number(h.monthly_contribution ?? 0) > 0)
    .map((h) => ({ monthly: Number(h.monthly_contribution), currency: h.currency }));

  return computeTotalCommitment({ displayCurrency: targetCurrency, rates, budgetLines, goals, dca, debts, policies });
}
