import "server-only";

/**
 * Servicio de datos del Módulo 2 (respeta RLS). El monto mensualizado se calcula
 * en el servidor con el motor `monthlyize` y se persiste en `amount_monthly_base`.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { monthlyize, type Frequency } from "@/modules/financial-base/engine/monthlyize";
import { computeBaseIndicators } from "@/modules/financial-base/engine/base-engine";
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

export async function listIncomes(): Promise<IncomeSource[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("income_sources")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToIncome);
}

export async function listExpenses(): Promise<ExpenseItem[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("expense_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToExpense);
}

export async function createIncome(input: IncomeInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("income_sources").insert({
    user_id: user.id,
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
  await supabase.from("expense_items").insert({
    user_id: user.id,
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
};

/** Carga ítems y calcula los indicadores de la base financiera. */
export async function getBaseSummary(): Promise<BaseSummary> {
  const [incomes, expenses] = await Promise.all([listIncomes(), listExpenses()]);
  return { indicators: computeBaseIndicators(incomes, expenses), incomes, expenses };
}

/** Moneda principal del usuario (de user_settings); CRC por defecto. */
export async function getPrimaryCurrency(): Promise<string> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("user_settings")
    .select("primary_currency")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.primary_currency ?? "CRC";
}
