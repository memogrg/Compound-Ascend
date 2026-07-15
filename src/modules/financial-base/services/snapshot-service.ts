import "server-only";

/**
 * Snapshots mensuales de la Base Financiera (cache de cálculo en monthly_snapshots).
 * Estrategia: upsert idempotente por (user_id, period). Se generan de forma
 * perezosa (al cargar la base se persiste el mes recién cerrado), de modo que el
 * histórico se acumula con el uso, sin necesidad de cron/service-role.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getRealTotals } from "@/modules/financial-base/services/transaction-service";
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import type { Database } from "@/lib/supabase/database.types";
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

/**
 * Cron multi-usuario (service role): genera el snapshot del periodo para todos
 * los usuarios con datos. No usa sesión ni cookies; toma la moneda principal de
 * cada usuario. Solo desde el endpoint protegido por X-Cron-Secret.
 */
export async function generateSnapshotsForAllUsers(
  period: Period,
): Promise<{ users: number; written: number }> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const rates = await getFxRates();
  const { data: users } = await admin.from("profiles").select("id");
  let written = 0;
  for (const u of users ?? []) {
    if (await snapshotUserAdmin(admin, u.id, period, rates)) written += 1;
  }
  return { users: users?.length ?? 0, written };
}

async function snapshotUserAdmin(
  admin: SupabaseClient<Database>,
  userId: string,
  period: Period,
  rates: Record<string, number>,
): Promise<boolean> {
  const { data: settings } = await admin
    .from("user_settings")
    .select("primary_currency")
    .eq("user_id", userId)
    .maybeSingle();
  const currency = settings?.primary_currency ?? "CRC";

  const [bi, tx] = await Promise.all([
    admin
      .from("budget_items")
      .select("type,amount,currency")
      .eq("user_id", userId)
      .eq("period_month", period.month)
      .eq("period_year", period.year),
    admin
      .from("transactions")
      .select("kind,amount,currency,counts_in_budget")
      .eq("user_id", userId)
      .gte("occurred_on", period.from)
      .lte("occurred_on", period.to),
  ]);

  if ((bi.data?.length ?? 0) === 0 && (tx.data?.length ?? 0) === 0) return false;

  let bIncome = 0,
    bExpense = 0,
    rIncome = 0,
    rExpense = 0;
  for (const r of bi.data ?? []) {
    const v = convertCurrency(Number(r.amount), r.currency, currency, rates);
    if (r.type === "income") bIncome += v;
    else bExpense += v;
  }
  for (const r of tx.data ?? []) {
    const v = convertCurrency(Number(r.amount), r.currency, currency, rates);
    if (r.kind === "ingreso") rIncome += v;
    // Off-budget (consumo de frasco): fuera del gasto del snapshot mensual.
    else if (r.kind === "gasto" && r.counts_in_budget !== false) rExpense += v;
  }

  await admin.from("monthly_snapshots").upsert(
    {
      user_id: userId,
      period: `${period.year}-${pad(period.month)}-01`,
      income_monthly: Math.round(rIncome),
      expense_monthly: Math.round(rExpense),
      free_cashflow: Math.round(rIncome - rExpense),
      breakdown: {
        budgetIncome: Math.round(bIncome),
        budgetExpense: Math.round(bExpense),
        realIncome: Math.round(rIncome),
        realExpense: Math.round(rExpense),
      },
    },
    { onConflict: "user_id,period" },
  );
  return true;
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
