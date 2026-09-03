import "server-only";

/**
 * Fetch del COMPROMISO MENSUAL TOTAL (insumo del número de INDEPENDENCIA). Espeja
 * getEssentialMonthlyExpense pero SIN el filtro is_essential y SUMANDO metas + DCA:
 *   sobres (todos, propios) + aportes a metas + DCA de inversiones + deudas + primas.
 * Normaliza a mensual + moneda de visualización, con alcance de hogar. Delega las reglas de
 * deduplicación al engine puro computeTotalCommitment. Best-effort en el llamador (patrimonio-service).
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { householdMemberIds } from "@/lib/household/active";
import { getDisplayCurrency, monthlyize, type Frequency } from "@/modules/financial-base";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { resolveBudgetPeriod } from "@/lib/budget/resolve-budget-period";
import {
  computeTotalCommitment,
  type CommitmentBreakdown,
} from "@/modules/wealth/engine/total-commitment";

export type { CommitmentBreakdown };

/**
 * Compromiso mensual total del hogar, con desglose por origen. Moneda: `opts.currency` (patrimonio
 * pasa la PRINCIPAL del reporte, para no meter el override de display en el número); por defecto la
 * de visualización.
 *
 * `opts.ctx` permite leerlo SIN sesión (cron / ingesta) con el cliente service-role,
 * igual que aggregateNetWorth. Sin él, esas rutas no podían calcular el compromiso y el reporte
 * caía a la lista base `expense_items` — que para quien presupuesta con sobres vale 0, así que
 * el camino sin sesión reportaba números distintos a los de la web para el MISMO usuario.
 */
export async function getTotalMonthlyCommitment(opts?: {
  currency?: string;
  ctx?: AuthContext;
}): Promise<CommitmentBreakdown> {
  const { db: supabase, userId } = await resolveAuth(opts?.ctx);
  const [members, rates] = await Promise.all([householdMemberIds(supabase, userId), getFxRates()]);
  const targetCurrency = opts?.currency ?? (await getDisplayCurrency(opts?.ctx));

  // Mes del presupuesto: el actual si ya tiene sobres, si no el último que los tenga. Sin
  // esto, el día 1 de cada mes los sobres valían 0 y el compromiso —y con él el gasto de
  // referencia y el número de independencia— se desplomaba sin que el usuario tocara nada.
  const actual = await userCurrentPeriod(opts?.ctx);
  const period = await resolveBudgetPeriod(supabase, members, actual);
  const [budgetRows, debtRows, goalRows, policyRows, holdingRows] = await Promise.all([
    // Presupuesto del mes: TODAS las líneas de gasto (sin filtro esencial). El engine cuenta solo
    // los sobres propios (manual/recurring); las derivadas van por su entidad (regla #1).
    supabase
      .from("budget_items")
      .select("amount,currency,source_kind")
      .in("user_id", members)
      .eq("type", "expense")
      .eq("period_month", period.month)
      .eq("period_year", period.year),
    // TODAS las deudas vigentes (sin filtro esencial): cuota = current_payment (o min_payment).
    supabase
      .from("debts")
      .select("current_payment,min_payment,currency")
      .in("user_id", members)
      .eq("is_current", true),
    // TODAS las metas: aporte mensual + policy_id (regla #2) + nombre.
    supabase
      .from("savings_goals")
      .select("name,monthly_contribution,currency,policy_id")
      .in("user_id", members),
    // TODAS las pólizas con prima: se mensualiza.
    supabase
      .from("insurance_policies")
      .select("id,policy_type,provider,premium,premium_frequency,currency")
      .in("user_id", members),
    // DCA: holdings con aporte mensual recurrente (monthly_contribution).
    supabase
      .from("investment_holdings")
      .select("monthly_contribution,currency")
      .in("user_id", members),
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

  const breakdown = computeTotalCommitment({
    displayCurrency: targetCurrency,
    rates,
    budgetLines,
    goals,
    dca,
    debts,
    policies,
  });
  return { ...breakdown, budgetPeriod: period };
}
