import "server-only";

/**
 * Fetch del gasto esencial mensual (insumo del número de seguridad). Junta las 4
 * fuentes marcadas `is_essential`, monetiza la prima de las pólizas y delega las
 * dos reglas de deduplicación al engine puro `computeEssentialMonthly`.
 *
 * Lecturas con alcance de hogar (householdMemberIds): la plata es compartida.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { householdMemberIds } from "@/lib/household/active";
import { getDisplayCurrency, monthlyize, type Frequency } from "@/modules/financial-base";
import { getFxRates } from "@/lib/market-data/fx-rates";
import {
  computeEssentialMonthly,
  type EssentialBreakdown,
} from "@/modules/wealth/engine/essential-expense";

export type { EssentialBreakdown };

/**
 * Gasto esencial mensual del hogar, con desglose por origen y las primas excluidas
 * por la regla #2 (financiadas vía un ahorro).
 *
 * Moneda: por defecto la de VISUALIZACIÓN (uso en /gastos). El llamador puede
 * fijar `opts.currency` para forzar otra — patrimonio-service pasa la PRINCIPAL del
 * reporte para NO meter el override de display en el contexto del asesor (el número
 * de seguridad queda en la misma moneda que el resto del reporte). Con opts.currency
 * NO se consulta getDisplayCurrency.
 */
export async function getEssentialMonthlyExpense(
  opts?: { currency?: string },
): Promise<EssentialBreakdown> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [members, rates] = await Promise.all([
    householdMemberIds(supabase, user.id),
    getFxRates(),
  ]);
  const targetCurrency = opts?.currency ?? (await getDisplayCurrency());

  const now = new Date();
  const [budgetRows, debtRows, goalRows, policyRows] = await Promise.all([
    // Presupuesto del mes: solo líneas de gasto de sobres esenciales. El engine
    // filtra por source_kind (regla #1); traemos source_kind para eso.
    supabase
      .from("budget_items")
      .select("amount,currency,source_kind,category_id,expense_categories!inner(is_essential)")
      .in("user_id", members)
      .eq("type", "expense")
      .eq("period_month", now.getMonth() + 1)
      .eq("period_year", now.getFullYear())
      .eq("expense_categories.is_essential", true),
    // Deudas esenciales: cuota = current_payment (o min_payment) mensual.
    supabase
      .from("debts")
      .select("current_payment,min_payment,currency")
      .in("user_id", members)
      .eq("is_essential", true)
      .eq("is_current", true),
    // Metas esenciales: aporte mensual + policy_id (regla #2) + nombre (transparencia).
    supabase
      .from("savings_goals")
      .select("name,monthly_contribution,currency,policy_id")
      .in("user_id", members)
      .eq("is_essential", true),
    // Pólizas esenciales: prima + frecuencia (se mensualiza) + tipo/proveedor (etiqueta).
    supabase
      .from("insurance_policies")
      .select("id,policy_type,provider,premium,premium_frequency,currency")
      .in("user_id", members)
      .eq("is_essential", true),
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

  return computeEssentialMonthly({
    displayCurrency: targetCurrency,
    rates,
    budgetLines,
    debts,
    goals,
    policies,
  });
}
