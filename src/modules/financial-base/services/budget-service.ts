import "server-only";

/** CRUD + agregados de presupuesto por mes (budget_items). Respeta RLS. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import {
  getCategoryNameMap,
  listCategoryTree,
} from "@/modules/financial-base/services/categories-service";
import { getRealTotals } from "@/modules/financial-base/services/transaction-service";
import { previousMonthPeriod } from "@/modules/financial-base/engine/period";
import { rollupByGroup, type GroupRollup } from "@/modules/financial-base/engine/budget-rollup";
import type { BudgetItem, BudgetType, Period } from "@/modules/financial-base/types";
import type { Frequency } from "@/modules/financial-base/engine/monthlyize";
import type { BudgetItemInput } from "@/modules/financial-base/schemas";
import type { BudgetItemRow } from "@/lib/supabase/database.types";

function rowToBudgetItem(r: BudgetItemRow): BudgetItem {
  return {
    id: r.id,
    type: r.type as BudgetType,
    categoryId: r.category_id,
    name: r.name,
    amount: Number(r.amount),
    currency: r.currency,
    frequency: r.frequency as Frequency,
    periodMonth: r.period_month,
    periodYear: r.period_year,
    sourceKind: (r.source_kind ?? "manual") as BudgetItem["sourceKind"],
    sourceId: r.source_id ?? null,
  };
}

/** Una línea derivada se edita en su entidad, nunca directo (candado). */
async function assertManualItem(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("budget_items")
    .select("source_kind")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (data && data.source_kind !== "manual") {
    throw new Error("Esta línea se deriva de una entidad; edítala desde su módulo.");
  }
}

export async function listBudgetItems(period: Period): Promise<BudgetItem[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("budget_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("period_month", period.month)
    .eq("period_year", period.year)
    .order("amount", { ascending: false });
  return (data ?? []).map(rowToBudgetItem);
}

export async function createBudgetItem(input: BudgetItemInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // household: las líneas manuales comparten hogar igual que las derivadas.
  const household_id = await getActiveHouseholdId(supabase, user.id);
  await supabase.from("budget_items").insert({
    user_id: user.id,
    household_id,
    type: input.type,
    category_id: input.categoryId ?? null,
    name: input.name,
    amount: input.amount,
    currency: input.currency,
    frequency: input.frequency,
    period_month: input.periodMonth,
    period_year: input.periodYear,
  });
}

/**
 * Copia las líneas de gasto MANUALES del mes anterior al periodo dado, sin
 * duplicar las categorías que ya tienen presupuesto este mes. Devuelve cuántas
 * copió. Las líneas derivadas (deuda/meta/etc.) no se copian: se regeneran solas.
 */
export async function copyPreviousMonthExpenseBudget(period: Period): Promise<number> {
  const prev = previousMonthPeriod(period);
  const [prevItems, curItems] = await Promise.all([listBudgetItems(prev), listBudgetItems(period)]);
  const present = new Set(
    curItems.filter((i) => i.type === "expense").map((i) => i.categoryId ?? "∅"),
  );
  const toCopy = prevItems.filter(
    (i) => i.type === "expense" && i.sourceKind === "manual" && !present.has(i.categoryId ?? "∅"),
  );
  for (const it of toCopy) {
    await createBudgetItem({
      type: "expense",
      categoryId: it.categoryId,
      name: it.name,
      amount: it.amount,
      currency: it.currency,
      frequency: it.frequency,
      periodMonth: period.month,
      periodYear: period.year,
    });
  }
  return toCopy.length;
}

export async function updateBudgetItem(id: string, input: BudgetItemInput): Promise<void> {
  await assertManualItem(id);
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("budget_items")
    .update({
      type: input.type,
      category_id: input.categoryId ?? null,
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      frequency: input.frequency,
      period_month: input.periodMonth,
      period_year: input.periodYear,
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function deleteBudgetItem(id: string): Promise<void> {
  await assertManualItem(id);
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("budget_items").delete().eq("id", id).eq("user_id", user.id);
}

/**
 * Fija el presupuesto de gasto de una categoría (sobre) para el periodo:
 * actualiza el budget_item manual existente o crea uno. Las líneas derivadas
 * (deuda/meta/póliza) quedan bloqueadas por assertManualItem en updateBudgetItem.
 * Lo usa el candado de "editar presupuesto del sobre" en el tab de Gastos.
 */
export async function setCategoryBudget(args: {
  categoryId: string;
  name: string;
  period: Period;
  amount: number;
  currency: string;
}): Promise<void> {
  const items = await listBudgetItems(args.period);
  const existing = items.find((b) => b.type === "expense" && b.categoryId === args.categoryId);
  if (existing) {
    await updateBudgetItem(existing.id, {
      type: "expense",
      categoryId: args.categoryId,
      name: existing.name,
      amount: args.amount,
      currency: existing.currency,
      frequency: existing.frequency,
      periodMonth: args.period.month,
      periodYear: args.period.year,
    });
    return;
  }
  await createBudgetItem({
    type: "expense",
    categoryId: args.categoryId,
    name: args.name,
    amount: args.amount,
    currency: args.currency,
    frequency: "mensual",
    periodMonth: args.period.month,
    periodYear: args.period.year,
  });
}

export type KeyedTotals = Record<string, { label: string; value: number }>;
export type BudgetTotals = {
  budgetIncome: number;
  budgetExpense: number;
  incomeByKey: KeyedTotals;
  expenseByKey: KeyedTotals;
  items: BudgetItem[];
  currency: string;
};

/** Totales de presupuesto del periodo, normalizados a la moneda de visualización. */
export async function getBudgetTotals(period: Period): Promise<BudgetTotals> {
  const [items, currency, rates, catMap] = await Promise.all([
    listBudgetItems(period),
    getDisplayCurrency(),
    getFxRates(),
    getCategoryNameMap(),
  ]);

  let budgetIncome = 0;
  let budgetExpense = 0;
  const incomeByKey: KeyedTotals = {};
  const expenseByKey: KeyedTotals = {};

  for (const it of items) {
    const value = convertCurrency(it.amount, it.currency, currency, rates);
    if (it.type === "income") {
      budgetIncome += value;
      const key = it.name.trim().toLowerCase() || it.id;
      incomeByKey[key] = { label: it.name, value: (incomeByKey[key]?.value ?? 0) + value };
    } else {
      budgetExpense += value;
      const key = it.categoryId ?? `name:${it.name.trim().toLowerCase()}`;
      const label = it.categoryId ? (catMap[it.categoryId] ?? it.name) : it.name;
      expenseByKey[key] = { label, value: (expenseByKey[key]?.value ?? 0) + value };
    }
  }

  return { budgetIncome, budgetExpense, incomeByKey, expenseByKey, items, currency };
}

/**
 * Cuota mensual por entidad (source_id) de un `source_kind` dado (p.ej. 'debt'),
 * normalizada a la moneda de visualización. Fuente única de la obligación: las
 * líneas derivadas que crea derived-budget-service ("Pago — {deuda}"). Para los
 * frascos vinculados budget-aware del tab de Gastos.
 */
export async function getLinkedBudgetBySource(
  period: Period,
  sourceKind: string,
): Promise<Record<string, number>> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [currency, rates] = await Promise.all([getDisplayCurrency(), getFxRates()]);
  const { data } = await supabase
    .from("budget_items")
    .select("amount,currency,source_id")
    .eq("user_id", user.id)
    .eq("period_month", period.month)
    .eq("period_year", period.year)
    .eq("source_kind", sourceKind);
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    if (!r.source_id) continue;
    out[r.source_id] =
      (out[r.source_id] ?? 0) + convertCurrency(Number(r.amount), r.currency, currency, rates);
  }
  return out;
}

/**
 * Presupuesto-vs-real agregado por GRUPO de Nivel 1 (rollup). Para vistas de
 * presupuesto jerárquico. No toca los agregados existentes.
 */
export async function getBudgetByGroup(period: Period): Promise<GroupRollup[]> {
  const [budget, real, tree] = await Promise.all([
    getBudgetTotals(period),
    getRealTotals(period),
    listCategoryTree("expense"),
  ]);
  return rollupByGroup(budget.expenseByKey, real.expenseByKey, tree);
}
