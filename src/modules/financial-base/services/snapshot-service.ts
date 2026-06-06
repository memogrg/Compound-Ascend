import "server-only";

/**
 * Snapshots mensuales de la Base Financiera (cache de cálculo en monthly_snapshots).
 * Estrategia: upsert idempotente por (user_id, period). Se generan de forma
 * perezosa (al cargar la base se persiste el mes recién cerrado), de modo que el
 * histórico se acumula con el uso, sin necesidad de cron/service-role.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getRealTotals } from "@/modules/financial-base/services/transaction-service";
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import type { Period } from "@/modules/financial-base/types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calcula y persiste (upsert) el snapshot del periodo dado para el usuario activo. */
export async function generateMonthlySnapshot(period: Period): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [real, budget] = await Promise.all([getRealTotals(period), getBudgetTotals(period)]);

  await supabase.from("monthly_snapshots").upsert(
    {
      user_id: user.id,
      period: `${period.year}-${pad(period.month)}-01`,
      income_monthly: Math.round(real.realIncome),
      expense_monthly: Math.round(real.realExpense),
      free_cashflow: Math.round(real.freeCashflowReal),
      breakdown: {
        budgetIncome: Math.round(budget.budgetIncome),
        budgetExpense: Math.round(budget.budgetExpense),
        realIncome: Math.round(real.realIncome),
        realExpense: Math.round(real.realExpense),
      },
    },
    { onConflict: "user_id,period" },
  );
}

/** Best-effort: no lanza (se usa como fire-and-forget al cargar la página). */
export async function tryGenerateMonthlySnapshot(period: Period): Promise<void> {
  try {
    await generateMonthlySnapshot(period);
  } catch {
    // Sin datos o sin sesión: se ignora.
  }
}

export type SnapshotPoint = {
  period: string;
  realIncome: number;
  realExpense: number;
  budgetIncome: number;
  budgetExpense: number;
  freeCashflow: number;
};

/** Lee el histórico cacheado de snapshots (orden cronológico). */
export async function getSnapshotHistory(monthsBack = 12): Promise<SnapshotPoint[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("monthly_snapshots")
    .select("period,income_monthly,expense_monthly,free_cashflow,breakdown")
    .eq("user_id", user.id)
    .order("period", { ascending: false })
    .limit(monthsBack);
  return (data ?? [])
    .map((r) => {
      const b = (r.breakdown ?? {}) as Record<string, number>;
      return {
        period: r.period,
        realIncome: Number(r.income_monthly),
        realExpense: Number(r.expense_monthly),
        budgetIncome: Number(b.budgetIncome ?? 0),
        budgetExpense: Number(b.budgetExpense ?? 0),
        freeCashflow: Number(r.free_cashflow),
      };
    })
    .reverse();
}
