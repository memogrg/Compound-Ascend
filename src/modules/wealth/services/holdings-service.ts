import "server-only";

/** CRUD de posiciones (investment_holdings). Respeta RLS. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import {
  registerLinkedTransaction,
  deleteLinkedTransaction,
  getSystemCategoryId,
  deleteIncomeSourcesByHolding,
} from "@/modules/financial-base";
import {
  holdingSaleToTxn,
  holdingPurchaseToTxn,
  purchaseExpenseAmount,
  positionIncreaseAmount,
} from "@/modules/financial-base";
import type { HoldingInput, HoldingSaleInput } from "@/modules/wealth/schemas";
import type { Holding, AssetType, InvestmentNature } from "@/modules/wealth/types";
import { natureOfCategory } from "@/modules/wealth/constants";

// Exportados para el snapshot de cron (sin sesión): mismo mapeo y columnas
// que el resto del módulo, sin duplicar la forma del row.
export function rowToHolding(r: {
  id: string;
  investment_id: string | null;
  symbol: string;
  asset_type: string;
  quantity: number;
  average_cost: number;
  purchase_date: string | null;
  broker: string | null;
  currency: string;
  label: string | null;
  current_value_manual?: number | null;
  rental_income?: number | null;
  rental_frequency?: string | null;
  rental_subtype?: string | null;
  needs_detail?: boolean | null;
  nature?: string | null;
  category?: string | null;
  income_month?: number | null;
  region?: string | null;
  is_recurring?: boolean | null;
}): Holding {
  return {
    id: r.id,
    investmentId: r.investment_id,
    symbol: r.symbol,
    assetType: r.asset_type as AssetType,
    quantity: Number(r.quantity),
    averageCost: Number(r.average_cost),
    purchaseDate: r.purchase_date,
    broker: r.broker,
    currency: r.currency,
    label: r.label,
    currentValueManual: r.current_value_manual == null ? null : Number(r.current_value_manual),
    rentalIncome: r.rental_income == null ? null : Number(r.rental_income),
    rentalFrequency: (r.rental_frequency ?? null) as Holding["rentalFrequency"],
    rentalSubtype: (r.rental_subtype ?? null) as Holding["rentalSubtype"],
    needsDetail: r.needs_detail ?? false,
    nature: (r.nature ?? null) as Holding["nature"],
    category: (r.category ?? null) as Holding["category"],
    incomeMonth: r.income_month == null ? null : Number(r.income_month),
    region: r.region ?? null,
    isRecurring: r.is_recurring ?? false,
  };
}

export const HOLDING_COLS =
  "id,investment_id,symbol,asset_type,quantity,average_cost,purchase_date,broker,currency,label,current_value_manual,rental_income,rental_frequency,rental_subtype,needs_detail,nature,category,income_month,region,is_recurring";

const QUOTED_TYPES = new Set(["etf", "accion", "cripto"]);

/**
 * Fase 4.1: la compra/aporte nace también como GASTO vinculado
 * (linked_kind='holding', categoría 'inversiones'). Devuelve el id de la
 * transacción para poder compensar si la escritura del holding falla.
 */
async function registerPurchaseExpense(args: {
  holdingId: string;
  label: string;
  currency: string;
  purchaseDate: string | null | undefined;
  amount: number;
  verb: "Compra" | "Aporte";
}): Promise<string | null> {
  if (args.amount <= 0) return null;
  return registerLinkedTransaction(
    holdingPurchaseToTxn({
      holdingId: args.holdingId,
      label: args.label,
      currency: args.currency,
      purchaseDate: args.purchaseDate ?? new Date().toISOString().slice(0, 10),
      amount: args.amount,
      verb: args.verb,
      categoryId: await getSystemCategoryId("inversiones"),
    }),
  );
}

/** Columnas de renta / valor manual compartidas por insert y update. */
function rentalColumns(input: HoldingInput) {
  return {
    current_value_manual: input.currentValueManual ?? null,
    rental_income: input.rentalIncome ?? null,
    rental_frequency: input.rentalFrequency ?? null,
    rental_subtype: input.rentalSubtype ?? null,
  };
}

/**
 * Símbolo a persistir. La columna sigue NOT NULL; las categorías no cotizadas
 * pueden venir sin símbolo, así que se rellena un placeholder derivado del
 * nombre (label, ≤12 chars) o 'MANUAL'.
 */
function resolveSymbol(input: HoldingInput): string {
  const explicit = input.symbol?.trim().toUpperCase();
  if (explicit) return explicit;
  const fromLabel = input.label?.trim().slice(0, 12).toUpperCase();
  return fromLabel || "MANUAL";
}

/** Columnas de taxonomía (nature derivada de category si no viene). */
function taxonomyColumns(input: HoldingInput) {
  const nature: InvestmentNature | null =
    input.nature ?? (input.category ? natureOfCategory(input.category) : null);
  return {
    nature,
    category: input.category ?? null,
    income_month: input.incomeMonth ?? null,
    region: input.region ?? null,
    is_recurring: input.isRecurring ?? false,
  };
}

export async function listHoldings(): Promise<Holding[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("investment_holdings")
    .select(HOLDING_COLS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToHolding);
}

export async function createHolding(input: HoldingInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const symbol = resolveSymbol(input);
  const label = input.label?.trim() || null;

  // Merge key: symbol + assetType + currency + label.
  // Same name → weighted-average merge; different name → separate position.
  let q = supabase
    .from("investment_holdings")
    .select("id, quantity, average_cost, broker")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .eq("asset_type", input.assetType)
    .eq("currency", input.currency);
  q = label === null ? q.is("label", null) : q.eq("label", label);
  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) throw new Error(selErr.message);

  const isRental = !QUOTED_TYPES.has(input.assetType);

  if (existing) {
    // Aporte a posición existente: el gasto vinculado nace primero (el id de
    // la entidad ya existe); si el update falla, se compensa borrándolo.
    let txnId: string | null = null;
    if (input.registerExpense) {
      txnId = await registerPurchaseExpense({
        holdingId: existing.id,
        label: label ?? symbol,
        currency: input.currency,
        purchaseDate: input.purchaseDate,
        amount: purchaseExpenseAmount({
          isRental,
          quantity: input.quantity,
          averageCost: input.averageCost,
          currentValueManual: input.currentValueManual,
        }),
        verb: "Aporte",
      });
    }

    const prevQty = Number(existing.quantity ?? 0);
    const prevAvg = Number(existing.average_cost ?? 0);
    const newQty = prevQty + input.quantity;
    const newAvg =
      newQty > 0
        ? (prevQty * prevAvg + input.quantity * input.averageCost) / newQty
        : input.averageCost;
    const { error } = await supabase
      .from("investment_holdings")
      .update({
        quantity: newQty,
        average_cost: newAvg,
        cost_basis: newQty * newAvg,
        purchase_date: input.purchaseDate ?? null,
        broker: input.broker ?? existing.broker ?? null,
      })
      .eq("id", existing.id)
      .eq("user_id", user.id);
    if (error) {
      if (txnId) await deleteLinkedTransaction(txnId);
      throw new Error(error.message);
    }
    return;
  }

  // household: cubre el hueco del sub-PR household de main (no tocó este insert).
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { data: created, error } = await supabase
    .from("investment_holdings")
    .insert({
      user_id: user.id,
      household_id,
      investment_id: input.investmentId ?? null,
      label,
      symbol,
      asset_type: input.assetType,
      quantity: input.quantity,
      average_cost: input.averageCost,
      cost_basis: input.quantity * input.averageCost,
      purchase_date: input.purchaseDate ?? null,
      broker: input.broker ?? null,
      currency: input.currency,
      ...rentalColumns(input),
      ...taxonomyColumns(input),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Compra nueva: el holding existe primero (la transacción lo referencia);
  // si el gasto vinculado falla, se compensa borrando el holding recién creado.
  if (input.registerExpense && created) {
    try {
      await registerPurchaseExpense({
        holdingId: created.id,
        label: label ?? symbol,
        currency: input.currency,
        purchaseDate: input.purchaseDate,
        amount: purchaseExpenseAmount({
          isRental,
          quantity: input.quantity,
          averageCost: input.averageCost,
          currentValueManual: input.currentValueManual,
        }),
        verb: "Compra",
      });
    } catch (err) {
      await supabase
        .from("investment_holdings")
        .delete()
        .eq("id", created.id)
        .eq("user_id", user.id);
      throw err;
    }
  }
}

export async function updateHolding(id: string, input: HoldingInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const symbol = resolveSymbol(input);

  // Fase 4.1 (opt-in, default OFF en edits porque el flujo no distingue
  // "aporte" de "corrección de datos"): si el usuario lo marca y el edit
  // AUMENTA la posición, solo el delta positivo nace como gasto vinculado.
  let txnId: string | null = null;
  if (input.registerExpense) {
    const { data: oldRow } = await supabase
      .from("investment_holdings")
      .select(HOLDING_COLS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (oldRow) {
      const old = rowToHolding(oldRow);
      const isRental = !QUOTED_TYPES.has(input.assetType);
      const amount = positionIncreaseAmount({
        isRental,
        oldQuantity: old.quantity,
        newQuantity: input.quantity,
        averageCost: input.averageCost,
        oldManualValue: old.currentValueManual,
        newManualValue: input.currentValueManual,
      });
      if (amount > 0) {
        txnId = await registerPurchaseExpense({
          holdingId: id,
          label: input.label?.trim() || symbol,
          currency: input.currency,
          purchaseDate: input.purchaseDate,
          amount,
          verb: "Aporte",
        });
      }
    }
  }

  const { error } = await supabase
    .from("investment_holdings")
    .update({
      investment_id: input.investmentId ?? null,
      symbol,
      asset_type: input.assetType,
      quantity: input.quantity,
      average_cost: input.averageCost,
      cost_basis: input.quantity * input.averageCost,
      purchase_date: input.purchaseDate ?? null,
      broker: input.broker ?? null,
      currency: input.currency,
      label: input.label ?? null,
      // Completar el detalle de un stub (Fase 3) lo marca como completo.
      needs_detail: false,
      ...rentalColumns(input),
      ...taxonomyColumns(input),
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    if (txnId) await deleteLinkedTransaction(txnId);
    throw new Error(error.message);
  }
}

export async function deleteHolding(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // Fase 3: borrar un stub revierte las fuentes de ingreso vinculadas (la
  // FK ON DELETE SET NULL solo desvincularía; aquí sí queremos eliminarlas).
  await deleteIncomeSourcesByHolding(id);
  const { error } = await supabase
    .from("investment_holdings")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

/** Posiciones stub pendientes de completar (needs_detail=true). */
export async function listPendingHoldings(): Promise<Holding[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("investment_holdings")
    .select(HOLDING_COLS)
    .eq("user_id", user.id)
    .eq("needs_detail", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToHolding);
}

/** Conteo de stubs pendientes (badge en nav). */
export async function countPendingHoldings(): Promise<number> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("investment_holdings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("needs_detail", true);
  return count ?? 0;
}

/**
 * Venta/retiro parcial (Fase 4 · flujos inversos): el dinero recibido nace
 * como ingreso vinculado (linked_kind='holding') y la posición disminuye —
 * cantidad en activos cotizados; valor manual en activos de renta. La
 * transacción ES el registro de la venta (no hay ledger aparte para
 * holdings). Compensación: si la actualización falla, se borra el ingreso.
 */
export async function recordHoldingSale(input: HoldingSaleInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: row, error: hErr } = await supabase
    .from("investment_holdings")
    .select(HOLDING_COLS)
    .eq("id", input.holdingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (hErr) throw new Error(hErr.message);
  if (!row) throw new Error("Posición no encontrada");
  const holding = rowToHolding(row);

  const txnId = await registerLinkedTransaction(
    holdingSaleToTxn({
      holdingId: holding.id,
      label: holding.label ?? holding.symbol,
      currency: input.currency,
      saleDate: input.saleDate,
      amount: input.amount,
      categoryId: await getSystemCategoryId("inc_venta"),
    }),
  );

  // Disminución en la entidad: cantidad (cotizados) o valor manual (renta).
  let patch: { quantity?: number; cost_basis?: number; current_value_manual?: number } = {};
  if (input.quantitySold && input.quantitySold > 0) {
    const newQty = Math.max(0, holding.quantity - input.quantitySold);
    patch = { quantity: newQty, cost_basis: newQty * holding.averageCost };
  } else if (holding.currentValueManual != null) {
    patch = { current_value_manual: Math.max(0, holding.currentValueManual - input.amount) };
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("investment_holdings")
      .update(patch)
      .eq("id", input.holdingId)
      .eq("user_id", user.id);
    if (error) {
      await deleteLinkedTransaction(txnId);
      throw new Error(error.message);
    }
  }
}
