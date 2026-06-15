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
import {
  getRealTotals,
  createTransaction,
} from "@/modules/financial-base/services/transaction-service";
import { monthPeriod, previousMonthPeriod } from "@/modules/financial-base/engine/period";
import { rollupByGroup, type GroupRollup } from "@/modules/financial-base/engine/budget-rollup";
import type { BudgetItem, BudgetType, IncomeType, Period } from "@/modules/financial-base/types";
import type { Frequency } from "@/modules/financial-base/engine/monthlyize";
import type {
  BudgetItemInput,
  IncomeSourceInput,
  PassiveIncomeStubInput,
} from "@/modules/financial-base/schemas";
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
    incomeType: (r.income_type ?? "activo") as IncomeType,
    recurringItemId: r.recurring_item_id ?? null,
    holdingId: r.holding_id ?? null,
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
    // income_type solo aplica a ingresos; los gastos lo dejan null.
    income_type: input.type === "income" ? (input.incomeType ?? "activo") : null,
    recurring_item_id: input.recurringItemId ?? null,
    holding_id: input.holdingId ?? null,
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
      income_type: input.type === "income" ? (input.incomeType ?? "activo") : null,
      recurring_item_id: input.recurringItemId ?? null,
      holding_id: input.holdingId ?? null,
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

// ============================ Fuentes de ingreso (Fase 1) ============================
// Una fuente = una línea budget_items (income) MANUAL y editable. Si es
// recurrente, se crea/vincula una plantilla en recurring_items INACTIVA
// (active=false): no la auto-sincroniza syncDerivedBudget; la copia al mes
// actual el botón "Copiar ingresos del mes anterior" de la Fase 2.

function periodFromDate(occurredOn: string): Period {
  const [y, m] = occurredOn.split("-").map(Number);
  return monthPeriod(y!, m!);
}

/** Crea la plantilla recurrente (inactiva) y devuelve su id. */
async function createRecurringTemplate(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  input: Pick<IncomeSourceInput, "name" | "amount" | "currency" | "frequency">,
): Promise<string> {
  const household_id = await getActiveHouseholdId(supabase, userId);
  const { data, error } = await supabase
    .from("recurring_items")
    .insert({
      user_id: userId,
      household_id,
      kind: "ingreso",
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      frequency: input.frequency,
      next_date: null,
      active: false, // copy-on-demand: no auto-sync.
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id;
}

export async function registerIncomeSource(
  input: IncomeSourceInput,
  holdingId?: string | null,
): Promise<string> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const period = periodFromDate(input.occurredOn);
  const recurringItemId = input.recurrent
    ? await createRecurringTemplate(supabase, user.id, input)
    : null;
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { data, error } = await supabase
    .from("budget_items")
    .insert({
      user_id: user.id,
      household_id,
      type: "income",
      category_id: input.categoryId ?? null,
      name: input.name,
      amount: input.amount,
      currency: input.currency,
      frequency: input.recurrent ? input.frequency : "mensual",
      period_month: period.month,
      period_year: period.year,
      income_type: input.incomeType,
      recurring_item_id: recurringItemId,
      holding_id: holdingId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id;
}

export async function updateIncomeSource(id: string, input: IncomeSourceInput): Promise<void> {
  await assertManualItem(id);
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: row } = await supabase
    .from("budget_items")
    .select("recurring_item_id,holding_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  let recurringItemId = row?.recurring_item_id ?? null;
  const holdingId = row?.holding_id ?? null;

  if (input.recurrent && recurringItemId) {
    // Mantiene sincronizada la plantilla recurrente con la fuente editada.
    await supabase
      .from("recurring_items")
      .update({
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        frequency: input.frequency,
      })
      .eq("id", recurringItemId)
      .eq("user_id", user.id);
  } else if (input.recurrent && !recurringItemId) {
    recurringItemId = await createRecurringTemplate(supabase, user.id, input);
  } else if (!input.recurrent && recurringItemId) {
    // Dejó de ser recurrente: descarta la plantilla.
    await supabase.from("recurring_items").delete().eq("id", recurringItemId).eq("user_id", user.id);
    recurringItemId = null;
  }

  const period = periodFromDate(input.occurredOn);
  await updateBudgetItem(id, {
    type: "income",
    categoryId: input.categoryId ?? null,
    name: input.name,
    amount: input.amount,
    currency: input.currency,
    frequency: input.recurrent ? input.frequency : "mensual",
    periodMonth: period.month,
    periodYear: period.year,
    incomeType: input.incomeType,
    recurringItemId,
    holdingId,
  });
}

export async function deleteIncomeSource(id: string): Promise<void> {
  await assertManualItem(id);
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: row } = await supabase
    .from("budget_items")
    .select("recurring_item_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  await supabase.from("budget_items").delete().eq("id", id).eq("user_id", user.id);
  if (row?.recurring_item_id) {
    await supabase
      .from("recurring_items")
      .delete()
      .eq("id", row.recurring_item_id)
      .eq("user_id", user.id);
  }
}

/**
 * Flujo inverso (Fase 3): un ingreso pasivo de renta/dividendos crea un STUB de
 * inversión (needs_detail=true) y lo vincula a la fuente (budget_items.holding_id).
 * El stub vive en investment_holdings (tabla de Patrimonio); se inserta directo
 * para NO invertir la dirección de dependencia (financial-base no importa wealth).
 * El detalle real se completa luego desde el wizard de Inversiones. Compensa
 * borrando el stub si la creación de la fuente falla.
 */
export async function registerPassiveIncomeWithStub(args: PassiveIncomeStubInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const isRental = args.subtype === "renta";
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { data: holding, error: hErr } = await supabase
    .from("investment_holdings")
    .insert({
      user_id: user.id,
      household_id,
      symbol: isRental ? "INMU" : args.assetName.toUpperCase().slice(0, 12),
      asset_type: isRental ? "inmueble" : "accion",
      label: args.assetName,
      currency: args.income.currency,
      quantity: 0,
      average_cost: 0,
      cost_basis: isRental ? null : args.baseValue,
      current_value_manual: isRental ? args.baseValue : null,
      needs_detail: true,
    })
    .select("id")
    .single();
  if (hErr) throw new Error(hErr.message);
  try {
    await registerIncomeSource({ ...args.income, incomeType: "pasivo" }, holding!.id);
  } catch (err) {
    await supabase
      .from("investment_holdings")
      .delete()
      .eq("id", holding!.id)
      .eq("user_id", user.id);
    throw err;
  }
}

/**
 * Revierte las fuentes de ingreso vinculadas a una inversión (Fase 3): al borrar
 * un stub se eliminan sus líneas de ingreso y sus plantillas recurrentes. Lo
 * llama wealth/deleteHolding (dirección wealth → financial-base).
 */
export async function deleteIncomeSourcesByHolding(holdingId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: rows } = await supabase
    .from("budget_items")
    .select("id,recurring_item_id")
    .eq("user_id", user.id)
    .eq("holding_id", holdingId);
  for (const r of rows ?? []) {
    await supabase.from("budget_items").delete().eq("id", r.id).eq("user_id", user.id);
    if (r.recurring_item_id) {
      await supabase
        .from("recurring_items")
        .delete()
        .eq("id", r.recurring_item_id)
        .eq("user_id", user.id);
    }
  }
}

/**
 * Recibido parcial (Fase 2): registra un ingreso confirmado atribuido a la
 * fuente (income_source_id). Cada llamada acumula en la barra buffer; se permite
 * pasar de 100% (sobre-recepción). La transacción nace con el nombre de la
 * fuente como merchantOrSource para la composición/listados.
 */
export async function receivePartialIncome(args: {
  budgetItemId: string;
  amount: number;
  date: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: line } = await supabase
    .from("budget_items")
    .select("name,currency,type")
    .eq("id", args.budgetItemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!line || line.type !== "income") {
    throw new Error("La fuente de ingreso ya no existe o no te pertenece.");
  }
  await createTransaction({
    kind: "ingreso",
    amount: args.amount,
    currency: line.currency,
    occurredOn: args.date,
    merchantOrSource: line.name,
    status: "confirmed",
    origin: "manual",
    incomeSourceId: args.budgetItemId,
  });
}

/**
 * Copia al periodo dado SOLO las fuentes de ingreso RECURRENTES del mes anterior
 * (las que enlazan una plantilla recurring_items). Idempotente: no duplica una
 * plantilla ya presente este mes. Devuelve cuántas copió. (Fase 2)
 */
export async function copyPreviousMonthIncome(period: Period): Promise<number> {
  const prev = previousMonthPeriod(period);
  const [prevItems, curItems] = await Promise.all([listBudgetItems(prev), listBudgetItems(period)]);
  const present = new Set(
    curItems.filter((i) => i.type === "income" && i.recurringItemId).map((i) => i.recurringItemId),
  );
  const toCopy = prevItems.filter(
    (i) => i.type === "income" && i.recurringItemId && !present.has(i.recurringItemId),
  );
  for (const it of toCopy) {
    await createBudgetItem({
      type: "income",
      categoryId: null,
      name: it.name,
      amount: it.amount,
      currency: it.currency,
      frequency: it.frequency,
      periodMonth: period.month,
      periodYear: period.year,
      incomeType: it.incomeType,
      recurringItemId: it.recurringItemId,
    });
  }
  return toCopy.length;
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
