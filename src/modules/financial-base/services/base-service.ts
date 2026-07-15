import "server-only";
import { cache } from "react";

/**
 * Servicio de datos del Módulo 2 (respeta RLS). El monto mensualizado se calcula
 * en el servidor con el motor `monthlyize` y se persiste en `amount_monthly_base`.
 */
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { getActiveHouseholdId } from "@/lib/household/active";
import { monthlyize, type Frequency } from "@/modules/financial-base/engine/monthlyize";
import { computeBaseIndicators } from "@/modules/financial-base/engine/base-engine";
import { monthPeriod } from "@/modules/financial-base/engine/period";
import { convertCurrency, SUPPORTED_CURRENCIES } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import type {
  IncomeSource,
  ExpenseItem,
  BaseIndicators,
  IncomeType,
  ExpenseNature,
  OwnerScope,
} from "@/modules/financial-base/types";
import type { IncomeInput, ExpenseInput } from "@/modules/financial-base/schemas";
import type { IncomeSourceRow, ExpenseItemRow } from "@/lib/supabase/database.types";

function rowToIncome(r: IncomeSourceRow): IncomeSource {
  return {
    id: r.id,
    name: r.name,
    incomeType: r.income_type as IncomeType,
    category: r.category,
    amount: Number(r.amount),
    currency: r.currency,
    frequency: r.frequency as Frequency,
    isFixed: r.is_fixed,
    certainty: r.certainty as IncomeSource["certainty"],
    ownerScope: r.owner_scope as OwnerScope,
    includeInBudget: r.include_in_budget,
    amountMonthly: Number(r.amount_monthly_base),
  };
}

function rowToExpense(r: ExpenseItemRow): ExpenseItem {
  return {
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    nature: (r.nature ?? "miscelaneo") as ExpenseNature,
    amount: Number(r.amount),
    currency: r.currency,
    frequency: r.frequency as Frequency,
    isFixed: r.is_fixed,
    obligation: r.obligation as ExpenseItem["obligation"],
    reducible: r.reducible as ExpenseItem["reducible"],
    ownerScope: r.owner_scope as OwnerScope,
    amountMonthly: Number(r.amount_monthly_base),
  };
}

export async function listIncomes(ctx?: AuthContext): Promise<IncomeSource[]> {
  const { db, userId } = await resolveAuth(ctx);
  const { data } = await db
    .from("income_sources")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToIncome);
}

export async function listExpenses(ctx?: AuthContext): Promise<ExpenseItem[]> {
  const { db, userId } = await resolveAuth(ctx);
  const { data } = await db
    .from("expense_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToExpense);
}

export async function createIncome(input: IncomeInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  await supabase.from("income_sources").insert({
    user_id: user.id,
    household_id,
    name: input.name,
    income_type: input.incomeType,
    category: input.category ?? null,
    amount: input.amount,
    currency: input.currency,
    frequency: input.frequency,
    is_fixed: input.isFixed,
    certainty: input.certainty ?? null,
    owner_scope: input.ownerScope,
    include_in_budget: input.includeInBudget,
    amount_monthly_base: monthlyize(input.amount, input.frequency),
  });
}

export async function createExpense(input: ExpenseInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  await supabase.from("expense_items").insert({
    user_id: user.id,
    household_id,
    name: input.name,
    nature: input.nature,
    amount: input.amount,
    currency: input.currency,
    frequency: input.frequency,
    is_fixed: input.isFixed,
    obligation: input.obligation ?? null,
    reducible: input.reducible ?? null,
    owner_scope: input.ownerScope,
    amount_monthly_base: monthlyize(input.amount, input.frequency),
  });
}

export async function updateIncome(id: string, input: IncomeInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("income_sources")
    .update({
      name: input.name,
      income_type: input.incomeType,
      category: input.category ?? null,
      amount: input.amount,
      currency: input.currency,
      frequency: input.frequency,
      is_fixed: input.isFixed,
      certainty: input.certainty ?? null,
      owner_scope: input.ownerScope,
      include_in_budget: input.includeInBudget,
      amount_monthly_base: monthlyize(input.amount, input.frequency),
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function updateExpense(id: string, input: ExpenseInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("expense_items")
    .update({
      name: input.name,
      nature: input.nature,
      amount: input.amount,
      currency: input.currency,
      frequency: input.frequency,
      is_fixed: input.isFixed,
      obligation: input.obligation ?? null,
      reducible: input.reducible ?? null,
      owner_scope: input.ownerScope,
      amount_monthly_base: monthlyize(input.amount, input.frequency),
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function deleteIncome(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("income_sources").delete().eq("id", id).eq("user_id", user.id);
}

export async function deleteExpense(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("expense_items").delete().eq("id", id).eq("user_id", user.id);
}

export type BaseSummary = {
  indicators: BaseIndicators;
  incomes: IncomeSource[];
  expenses: ExpenseItem[];
  // Base Financiera V2 — campos AÑADIDOS (opcionales; no rompen consumidores).
  // Presupuesto y real del MES ACTUAL, normalizados a la moneda de visualización.
  budgetIncome?: number;
  realIncome?: number;
  budgetExpense?: number;
  realExpense?: number;
  variances?: { income: number; expense: number };
};

/** Carga ítems y calcula los indicadores de la base financiera. */
async function _getBaseSummary(ctx?: AuthContext): Promise<BaseSummary> {
  const [incomes, expenses, primary, rates] = await Promise.all([
    listIncomes(ctx),
    listExpenses(ctx),
    getDisplayCurrency(ctx),
    getFxRates(),
  ]);
  // Los indicadores agregan dinero, así que normalizamos cada ítem a la moneda
  // de visualización antes de sumar. Los montos por ítem se conservan en su moneda
  // original (los componentes los muestran tal cual el usuario los registró).
  const incForEngine = incomes.map((i) => ({
    ...i,
    amountMonthly: convertCurrency(i.amountMonthly, i.currency, primary, rates),
  }));
  const expForEngine = expenses.map((e) => ({
    ...e,
    amountMonthly: convertCurrency(e.amountMonthly, e.currency, primary, rates),
  }));

  const summary: BaseSummary = {
    indicators: computeBaseIndicators(incForEngine, expForEngine),
    incomes,
    expenses,
  };

  // V2 (best-effort, no bloquea ni rompe a los 5 consumidores si falla).
  try {
    const v2 = await computeV2Totals(primary, rates);
    Object.assign(summary, v2);
  } catch {
    // Sin presupuesto/transacciones aún: los campos V2 quedan undefined.
  }

  return summary;
}

/** Presupuesto-vs-real del mes actual (campos V2 de getBaseSummary). */
async function computeV2Totals(
  displayCurrency: string,
  rates: Record<string, number>,
): Promise<
  Pick<BaseSummary, "budgetIncome" | "realIncome" | "budgetExpense" | "realExpense" | "variances">
> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const p = monthPeriod(now.getFullYear(), now.getMonth() + 1);

  const [bi, tx] = await Promise.all([
    supabase
      .from("budget_items")
      .select("type,amount,currency")
      .eq("user_id", user.id)
      .eq("period_month", p.month)
      .eq("period_year", p.year),
    supabase
      .from("transactions")
      .select("kind,amount,currency,counts_in_budget")
      .eq("user_id", user.id)
      .gte("occurred_on", p.from)
      .lte("occurred_on", p.to),
  ]);

  let budgetIncome = 0;
  let budgetExpense = 0;
  let realIncome = 0;
  let realExpense = 0;
  for (const r of bi.data ?? []) {
    const v = convertCurrency(Number(r.amount), r.currency, displayCurrency, rates);
    if (r.type === "income") budgetIncome += v;
    else budgetExpense += v;
  }
  for (const r of tx.data ?? []) {
    const v = convertCurrency(Number(r.amount), r.currency, displayCurrency, rates);
    if (r.kind === "ingreso") realIncome += v;
    // Off-budget (consumo de frasco): fuera del gasto real en la varianza presup-vs-real.
    else if (r.counts_in_budget !== false) realExpense += v;
  }

  return {
    budgetIncome,
    realIncome,
    budgetExpense,
    realExpense,
    variances: {
      income: budgetIncome > 0 ? (realIncome - budgetIncome) / budgetIncome : 0,
      expense: budgetExpense > 0 ? (realExpense - budgetExpense) / budgetExpense : 0,
    },
  };
}

/** Moneda principal del usuario (de user_settings); CRC por defecto.
 *  Es la moneda por defecto al registrar ítems nuevos. */
async function _getPrimaryCurrency(ctx?: AuthContext): Promise<string> {
  const { db, userId } = await resolveAuth(ctx);
  const { data } = await db
    .from("user_settings")
    .select("primary_currency")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.primary_currency ?? "CRC";
}

/** Cookie que guarda la moneda de visualización (switch rápido en dashboards). */
export const DISPLAY_CURRENCY_COOKIE = "ca_display_currency";

/**
 * Moneda de visualización de los dashboards: si hay override por cookie (el
 * switch rápido), se usa esa; si no, la moneda principal. Solo afecta cómo se
 * MUESTRAN los totales — los datos se registran en la moneda que el usuario
 * elija y la app los convierte a esta para mostrarlos.
 */
async function _getDisplayCurrency(ctx?: AuthContext): Promise<string> {
  // Sin sesión (cron): no hay cookie de override → se usa la moneda primaria.
  if (ctx) return getPrimaryCurrency(ctx);
  const store = await cookies();
  const override = store.get(DISPLAY_CURRENCY_COOKIE)?.value;
  if (override && (SUPPORTED_CURRENCIES as readonly string[]).includes(override)) {
    return override;
  }
  return getPrimaryCurrency();
}

/** Dedup por request (React cache): se llamaba getBaseSummary varias veces por render. */
export const getBaseSummary = cache(_getBaseSummary);

/** Dedup por request (React cache): se llamaba getPrimaryCurrency varias veces por render. */
export const getPrimaryCurrency = cache(_getPrimaryCurrency);

/** Dedup por request (React cache): se llamaba getDisplayCurrency varias veces por render. */
export const getDisplayCurrency = cache(_getDisplayCurrency);
