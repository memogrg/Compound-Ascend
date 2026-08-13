import "server-only";
import { monedaDelMovimientoEsCoherente } from "@/modules/wealth/engine/portfolio-engine";

/** CRUD de posiciones (investment_holdings). Respeta RLS. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { now as simNow } from "@/lib/time/clock";
import {
  getActiveHouseholdId,
  householdMemberIds,
  householdWriteScope,
} from "@/lib/household/active";
import { logHouseholdDeletion } from "@/lib/household/activity-log";
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
import type {
  HoldingInput,
  HoldingSaleInput,
  HoldingContributionInput,
} from "@/modules/wealth/schemas";
import { planContribution } from "@/modules/wealth/engine/holding-contribution";
import type { Holding, HoldingNativo, AssetType, InvestmentNature } from "@/modules/wealth/types";
import { comoNativo } from "@/modules/wealth/types";
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
  monthly_contribution?: number | null;
  purchase_price?: number | null;
  closing_costs?: number | null;
  vacancy_pct?: number | null;
  mgmt_pct?: number | null;
  maintenance_monthly?: number | null;
  hoa_monthly?: number | null;
  property_tax_annual?: number | null;
  insurance_annual?: number | null;
  services_monthly?: number | null;
  debt_id?: string | null;
  annual_rate_pct?: number | null;
  maturity_date?: string | null;
  term_years?: number | null;
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
    annualRatePct: r.annual_rate_pct == null ? null : Number(r.annual_rate_pct),
    maturityDate: r.maturity_date ?? null,
    termYears: r.term_years == null ? null : Number(r.term_years),
    region: r.region ?? null,
    isRecurring: r.is_recurring ?? false,
    monthlyContribution: r.monthly_contribution == null ? null : Number(r.monthly_contribution),
    purchasePrice: r.purchase_price == null ? null : Number(r.purchase_price),
    closingCosts: r.closing_costs == null ? null : Number(r.closing_costs),
    vacancyPct: r.vacancy_pct == null ? null : Number(r.vacancy_pct),
    mgmtPct: r.mgmt_pct == null ? null : Number(r.mgmt_pct),
    maintenanceMonthly: r.maintenance_monthly == null ? null : Number(r.maintenance_monthly),
    hoaMonthly: r.hoa_monthly == null ? null : Number(r.hoa_monthly),
    propertyTaxAnnual: r.property_tax_annual == null ? null : Number(r.property_tax_annual),
    insuranceAnnual: r.insurance_annual == null ? null : Number(r.insurance_annual),
    servicesMonthly: r.services_monthly == null ? null : Number(r.services_monthly),
    debtId: r.debt_id ?? null,
  };
}

export const HOLDING_COLS =
  "id,investment_id,symbol,asset_type,quantity,average_cost,purchase_date,broker,currency,label,current_value_manual,rental_income,rental_frequency,rental_subtype,needs_detail,nature,category,income_month,region,is_recurring,monthly_contribution,purchase_price,closing_costs,vacancy_pct,mgmt_pct,maintenance_monthly,hoa_monthly,property_tax_annual,insurance_annual,services_monthly,debt_id,annual_rate_pct,maturity_date,term_years";

const QUOTED_TYPES = new Set(["etf", "accion", "cripto"]);

/**
 * Fase 4.1: la compra/aporte nace también como GASTO vinculado
 * (linked_kind='holding', categoría 'inversiones'). Devuelve el id de la
 * transacción para poder compensar si la escritura del holding falla.
 */
export async function registerPurchaseExpense(
  args: {
    holdingId: string;
    label: string;
    currency: string;
    purchaseDate: string | null | undefined;
    amount: number;
    verb: "Compra" | "Aporte" | "Prima" | "Adelanto";
  },
  ctx?: AuthContext,
): Promise<string | null> {
  if (args.amount <= 0) return null;
  const id = await registerLinkedTransaction(
    holdingPurchaseToTxn({
      holdingId: args.holdingId,
      label: args.label,
      currency: args.currency,
      purchaseDate: args.purchaseDate ?? simNow().toISOString().slice(0, 10),
      amount: args.amount,
      verb: args.verb,
      categoryId: await getSystemCategoryId("inversiones", ctx),
    }),
    ctx,
  );
  // Defensivo: garantizar el vínculo al holding. Aunque holdingPurchaseToTxn ya lo
  // setea, blindamos por si createTransaction lo normaliza a 'none' en algún flujo.
  if (id) {
    const { db: supabase, userId } = await resolveAuth(ctx);
    const scope = await householdWriteScope(supabase, userId);
    await supabase
      .from("transactions")
      .update({ last_edited_by: userId, linked_kind: "holding", linked_id: args.holdingId })
      .eq("id", id)
      .in("user_id", scope);
  }
  return id;
}

/**
 * Registra una compra en investment_transactions (historial DCA). Best-effort:
 * si falla, loguea pero no rompe la creación del holding. Incluye household_id
 * (invariante CLAUDE.md) para que el resto del hogar vea el historial.
 */
async function recordPurchaseTx(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  holdingId: string,
  input: HoldingInput,
) {
  const qty = input.quantity ?? 0;
  const price = input.averageCost ?? 0;
  if (!(qty > 0) || !(price > 0)) return; // solo compras cuantificables
  const household_id = await getActiveHouseholdId(supabase, userId);
  const { error } = await supabase.from("investment_transactions").insert({
    user_id: userId,
    household_id,
    created_by: userId,
    last_edited_by: userId,
    holding_id: holdingId,
    tx_type: "compra",
    amount: qty * price,
    quantity: qty,
    currency: input.currency,
    occurred_on: input.purchaseDate ?? simNow().toISOString().slice(0, 10),
  });
  if (error) console.error(`[recordPurchaseTx] falló (${holdingId}): ${error.message}`);
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

/** Columnas de costos del inmueble de renta (migración 20260628000002). */
function costColumns(input: HoldingInput) {
  return {
    purchase_price: input.purchasePrice ?? null,
    closing_costs: input.closingCosts ?? null,
    vacancy_pct: input.vacancyPct ?? null,
    mgmt_pct: input.mgmtPct ?? null,
    maintenance_monthly: input.maintenanceMonthly ?? null,
    hoa_monthly: input.hoaMonthly ?? null,
    property_tax_annual: input.propertyTaxAnnual ?? null,
    insurance_annual: input.insuranceAnnual ?? null,
    services_monthly: input.servicesMonthly ?? null,
  };
}

/** Deuda que financia el inmueble (C-1b · migración 20260629000001). */
function debtColumns(input: HoldingInput) {
  return { debt_id: input.debtId ?? null };
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
    annual_rate_pct: input.annualRatePct ?? null,
    maturity_date: input.maturityDate ?? null,
    term_years: input.termYears ?? null,
    region: input.region ?? null,
    is_recurring: input.isRecurring ?? false,
    // Solo el recurrente lleva aporte mensual; el resto lo deja en NULL.
    monthly_contribution: input.isRecurring ? (input.monthlyContribution ?? null) : null,
  };
}

/** Lee los holdings TAL CUAL están guardados: cada importe en la moneda del propio
 *  holding. Es la única fuente válida para precargar un formulario de captura — lo que
 *  sale de `normalizeHoldings` viene convertido y no lleva la marca. */
export async function listHoldings(ctx?: AuthContext): Promise<HoldingNativo[]> {
  const { db, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(db, userId);
  const { data } = await db
    .from("investment_holdings")
    .select(HOLDING_COLS)
    .in("user_id", memberIds)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToHolding).map(comoNativo);
}

/**
 * Posición AGREGADA del usuario en un símbolo, leída de las holdings COMPLETAS (scope de hogar) —
 * NO del top-N compacto del contexto de la IA, que trunca las posiciones chicas o con precio $0.
 * Devuelve cantidad + invertido (costo = cantidad×costo promedio) en la moneda nativa del holding,
 * o null si no hay posición. Para el carril de mercado del asesor ("si vendo mi JUP al ATH…").
 */
export async function getPositionForSymbol(
  symbol: string,
  ctx?: AuthContext,
): Promise<{ quantity: number; invested: number; currency: string; assetType: AssetType } | null> {
  const target = symbol.trim().toUpperCase();
  if (!target) return null;
  const holdings = await listHoldings(ctx);
  const matching = holdings.filter((h) => h.symbol?.toUpperCase() === target && h.quantity > 0);
  if (matching.length === 0) return null;
  // Agregado por moneda (lo normal es una sola): elegimos la de mayor invertido para no mezclar
  // monedas al sumar. cantidad e invertido salen de esa moneda; el llamador convierte si hace falta.
  const porMoneda = new Map<string, { quantity: number; invested: number; assetType: AssetType }>();
  for (const h of matching) {
    const acc = porMoneda.get(h.currency) ?? { quantity: 0, invested: 0, assetType: h.assetType };
    acc.quantity += h.quantity;
    acc.invested += h.quantity * h.averageCost;
    porMoneda.set(h.currency, acc);
  }
  let currency = "";
  let best: { quantity: number; invested: number; assetType: AssetType } | null = null;
  for (const [cur, acc] of porMoneda) {
    if (!best || acc.invested > best.invested) {
      best = acc;
      currency = cur;
    }
  }
  return best
    ? {
        quantity: best.quantity,
        invested: Math.round(best.invested),
        currency,
        assetType: best.assetType,
      }
    : null;
}

export async function createHolding(input: HoldingInput, ctx?: AuthContext): Promise<void> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const scope = await householdWriteScope(supabase, userId);
  const symbol = resolveSymbol(input);
  const label = input.label?.trim() || null;

  // Merge key: symbol + assetType + currency + label.
  // Same name → weighted-average merge; different name → separate position.
  let q = supabase
    .from("investment_holdings")
    .select("id, quantity, average_cost, broker")
    .in("user_id", scope)
    .eq("symbol", symbol)
    .eq("asset_type", input.assetType)
    .eq("currency", input.currency);
  q = label === null ? q.is("label", null) : q.eq("label", label);
  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) throw new Error(selErr.message);

  const isRental = !QUOTED_TYPES.has(input.assetType);

  // Merge por promedio de costo SOLO para cotizados (comprar más acciones/ETF/
  // cripto promedia el costo unitario). Los activos manuales/flujo (inmueble,
  // préstamo, CDP, bono) son posiciones ÚNICAS: fusionarlas por nombre promediaba
  // el monto invertido (se veía distinto/menos) y el UPDATE no reescribía
  // rental_income/nature, así que el ingreso no llegaba a Ingresos. Cada una se
  // inserta aparte; para “aportar” a una posición manual, se edita.
  const canMerge = QUOTED_TYPES.has(input.assetType);

  if (existing && canMerge) {
    // Aporte a posición existente: el gasto vinculado nace primero (el id de
    // la entidad ya existe); si el update falla, se compensa borrándolo.
    let txnId: string | null = null;
    if (input.registerExpense) {
      txnId = await registerPurchaseExpense(
        {
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
        },
        ctx,
      );
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
        last_edited_by: userId,
        quantity: newQty,
        average_cost: newAvg,
        cost_basis: newQty * newAvg,
        purchase_date: input.purchaseDate ?? null,
        broker: input.broker ?? existing.broker ?? null,
      })
      .eq("id", existing.id)
      .in("user_id", scope);
    if (error) {
      if (txnId) await deleteLinkedTransaction(txnId, ctx);
      throw new Error(error.message);
    }
    await recordPurchaseTx(supabase, userId, existing.id, input);
    return;
  }

  // household: cubre el hueco del sub-PR household de main (no tocó este insert).
  const household_id = await getActiveHouseholdId(supabase, userId);
  const { data: created, error } = await supabase
    .from("investment_holdings")
    .insert({
      user_id: userId,
      household_id,
      created_by: userId,
      last_edited_by: userId,
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
      ...costColumns(input),
      ...debtColumns(input),
      ...taxonomyColumns(input),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (canMerge && created) await recordPurchaseTx(supabase, userId, created.id, input);

  // Compra nueva: el holding existe primero (la transacción lo referencia);
  // si el gasto vinculado falla, se compensa borrando el holding recién creado.
  if (input.registerExpense && created) {
    try {
      await registerPurchaseExpense(
        {
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
        },
        ctx,
      );
    } catch (err) {
      await supabase.from("investment_holdings").delete().eq("id", created.id).in("user_id", scope);
      throw err;
    }
  }
}

/**
 * Aporte/compra a una posición EXISTENTE (el "+" contextual de Inversiones). Unifica los dos
 * tipos con escritura atómica y rollback compensatorio:
 *  - COTIZADO: delega en `createHolding`, que encuentra esta posición por su clave, promedia
 *    el costo, registra el historial (compra) y el gasto vinculado con su propio rollback.
 *    NO se reescribe la matemática del DCA.
 *  - NO COTIZADO (certificado, inmueble, bono…): sube el invertido y el valor manual por el
 *    importe. El gasto vinculado nace primero y se compensa (`deleteLinkedTransaction`) si el
 *    UPDATE del holding falla; luego una fila de historial da paridad con el cotizado.
 *
 * La moneda la impone el holding (misma guarda que la venta): un importe que la contradiga se
 * rechaza en vez de guardarse contra una referencia equivocada.
 */
export async function contributeToHolding(
  input: HoldingContributionInput,
  ctx?: AuthContext,
): Promise<void> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const scope = await householdWriteScope(supabase, userId);

  const { data: row, error: hErr } = await supabase
    .from("investment_holdings")
    .select(HOLDING_COLS)
    .eq("id", input.holdingId)
    .in("user_id", scope)
    .maybeSingle();
  if (hErr) throw new Error(hErr.message);
  if (!row) throw new Error("Posición no encontrada");
  const holding = rowToHolding(row);

  if (!monedaDelMovimientoEsCoherente(input.currency, holding.currency)) {
    throw new Error(
      `El aporte viene en ${input.currency} pero la inversión está en ${holding.currency}.`,
    );
  }

  const plan = planContribution(holding, { amount: input.amount, unitPrice: input.unitPrice });
  const occurredOn = input.occurredOn;

  if (plan.kind === "quoted") {
    // Encuentra ESTA posición por su clave (symbol+tipo+moneda+etiqueta), promedia el costo,
    // registra el historial y el gasto vinculado con su propio rollback compensatorio.
    await createHolding(
      {
        assetType: holding.assetType,
        symbol: holding.symbol ?? undefined,
        label: holding.label ?? undefined,
        currency: holding.currency,
        quantity: plan.quantity,
        averageCost: plan.unitPrice,
        purchaseDate: occurredOn,
        broker: holding.broker ?? undefined,
        registerExpense: true,
      },
      ctx,
    );
    return;
  }

  // No cotizado: subir invertido + valor manual, atómico con el gasto vinculado.
  const symbol = holding.symbol ?? holding.label ?? "";
  const newAvg = holding.quantity > 0 ? plan.newInvested / holding.quantity : plan.newInvested;

  // El gasto nace primero (la entidad ya existe); si el UPDATE falla, se compensa borrándolo.
  const txnId = await registerPurchaseExpense(
    {
      holdingId: holding.id,
      label: holding.label ?? symbol,
      currency: holding.currency,
      purchaseDate: occurredOn,
      amount: plan.addedAmount,
      verb: "Aporte",
    },
    ctx,
  );
  const { error } = await supabase
    .from("investment_holdings")
    .update({
      last_edited_by: userId,
      average_cost: newAvg,
      cost_basis: plan.newInvested,
      current_value_manual: plan.newValue,
    })
    .eq("id", holding.id)
    .in("user_id", scope);
  if (error) {
    if (txnId) await deleteLinkedTransaction(txnId, ctx);
    throw new Error(error.message);
  }
  // Historial (best-effort, como recordPurchaseTx): compra del importe, sin cantidad — un
  // certificado no tiene unidades —, para que el aporte aparezca en el detalle igual que uno
  // cotizado.
  await recordManualContributionTx(supabase, userId, holding.id, {
    amount: plan.addedAmount,
    currency: holding.currency,
    occurredOn,
  });
}

/** Historial de un aporte a posición MANUAL (sin cantidad). Best-effort: loguea si falla. */
async function recordManualContributionTx(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  holdingId: string,
  args: { amount: number; currency: string; occurredOn: string },
) {
  if (!(args.amount > 0)) return;
  const household_id = await getActiveHouseholdId(supabase, userId);
  const { error } = await supabase.from("investment_transactions").insert({
    user_id: userId,
    household_id,
    created_by: userId,
    last_edited_by: userId,
    holding_id: holdingId,
    tx_type: "compra",
    amount: args.amount,
    quantity: null,
    currency: args.currency,
    occurred_on: args.occurredOn,
  });
  if (error) console.error(`[recordManualContributionTx] falló (${holdingId}): ${error.message}`);
}

export async function updateHolding(id: string, input: HoldingInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
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
      .in("user_id", scope)
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
      last_edited_by: user.id,
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
      ...costColumns(input),
      ...debtColumns(input),
      ...taxonomyColumns(input),
    })
    .eq("id", id)
    .in("user_id", scope);
  if (error) {
    if (txnId) await deleteLinkedTransaction(txnId);
    throw new Error(error.message);
  }
}

/**
 * Fija SOLO el aporte mensual (DCA) de una posición, y la marca recurrente si el aporte es > 0.
 *
 * Escritura ESTRECHA a propósito, en vez de reusar `updateHolding`: esa hace un update completo
 * desde `HoldingInput`, así que cambiar un campo obliga a reconstruir el resto de la posición y
 * cualquier omisión lo pisaría con un default. Para un ajuste que nace de un consejo del asesor
 * ("subí el aporte a $200"), tocar dos columnas es lo correcto y lo seguro.
 *
 * Aporte 0 = deja de ser recurrente (así se apaga un DCA sin borrar la posición).
 */
export async function setHoldingDca(id: string, monthlyContribution: number): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase
    .from("investment_holdings")
    .update({
      monthly_contribution: monthlyContribution,
      is_recurring: monthlyContribution > 0,
    })
    .eq("id", id)
    .in("user_id", scope);
  if (error) throw new Error(error.message);
}

export async function deleteHolding(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  // Fase 3: borrar un stub revierte las fuentes de ingreso vinculadas (la
  // FK ON DELETE SET NULL solo desvincularía; aquí sí queremos eliminarlas).
  await deleteIncomeSourcesByHolding(id);
  // Limpiar las transacciones de aporte/compra vinculadas al holding: linked_id es
  // polimórfico (no puede tener FK CASCADE), así que se borran acá para no dejar
  // gastos huérfanos ("Aporte — X"/"Compra — X") apuntando a una inversión inexistente.
  const { error: txErr } = await supabase
    .from("transactions")
    .delete()
    .in("user_id", scope)
    .eq("linked_kind", "holding")
    .eq("linked_id", id);
  if (txErr) throw new Error(txErr.message);
  const { error } = await supabase
    .from("investment_holdings")
    .delete()
    .eq("id", id)
    .in("user_id", scope);
  if (error) throw new Error(error.message);
  // Log: la entidad primaria es el holding; sus transacciones/ingresos vinculados
  // se borraron en cascada como parte de esta misma acción del usuario.
  await logHouseholdDeletion(supabase, {
    userId: user.id,
    table: "investment_holdings",
    rowId: id,
  });
}

/** Posiciones stub pendientes de completar (needs_detail=true). */
export async function listPendingHoldings(): Promise<Holding[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("investment_holdings")
    .select(HOLDING_COLS)
    .in("user_id", memberIds)
    .eq("needs_detail", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToHolding);
}

/** Conteo de stubs pendientes (badge en nav). */
export async function countPendingHoldings(): Promise<number> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { count } = await supabase
    .from("investment_holdings")
    .select("id", { count: "exact", head: true })
    .in("user_id", memberIds)
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
  const scope = await householdWriteScope(supabase, user.id);

  const { data: row, error: hErr } = await supabase
    .from("investment_holdings")
    .select(HOLDING_COLS)
    .eq("id", input.holdingId)
    .in("user_id", scope)
    .maybeSingle();
  if (hErr) throw new Error(hErr.message);
  if (!row) throw new Error("Posición no encontrada");
  const holding = rowToHolding(row);

  // Lee el holding ENTERO desde hace tiempo y aun así etiquetaba la venta con
  // `input.currency`. La moneda la impone el holding; una que lo contradiga es señal de que
  // el importe se calculó contra otra referencia, y se falla en vez de guardar callado.
  if (!monedaDelMovimientoEsCoherente(input.currency, holding.currency)) {
    throw new Error(
      `La venta viene en ${input.currency} pero la inversión está en ${holding.currency}.`,
    );
  }

  const txnId = await registerLinkedTransaction(
    holdingSaleToTxn({
      holdingId: holding.id,
      label: holding.label ?? holding.symbol,
      currency: holding.currency,
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
      .in("user_id", scope);
    if (error) {
      await deleteLinkedTransaction(txnId);
      throw new Error(error.message);
    }
  }
}
