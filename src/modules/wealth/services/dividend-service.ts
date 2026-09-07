import "server-only";
import { monedaDelMovimientoEsCoherente } from "@/modules/wealth/engine/portfolio-engine";

/**
 * CRUD de dividendos. Cada pago nace como transacción vinculada (ingreso,
 * linked_kind='holding') atribuida a la LÍNEA DERIVADA de dividendos del periodo
 * (income_source_id → budget_items), que llena su barra "Recibido". Ya NO se
 * crea un `income_sources` por pago: la proyección la representa la línea
 * derivada (promedio 12m, source_kind='dividend'). Mismo patrón que
 * createRentalPayment. Respeta RLS por user_id.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import {
  registerLinkedTransaction,
  deleteLinkedTransaction,
  getSystemCategoryId,
  syncDerivedBudget,
  monthPeriod,
} from "@/modules/financial-base";
import { dividendToTxn } from "@/modules/financial-base";
import {
  getActiveHouseholdId,
  householdMemberIds,
  householdWriteScope,
} from "@/lib/household/active";
import { logHouseholdDeletion } from "@/lib/household/activity-log";
import type { DividendInput } from "@/modules/wealth/schemas";
import type { Dividend } from "@/modules/wealth/types";
import { esFrecuenciaPago, proximaFechaPago } from "@/lib/finance/rendimiento-periodico";

/** Día siguiente en ISO, sin zona horaria de por medio (fecha pura). */
function sumarUnDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function rowToDividend(r: {
  id: string;
  holding_id: string;
  payment_date: string;
  amount: number;
  currency: string;
  yield_pct: number | null;
  frequency: string | null;
  income_id: string | null;
}): Dividend {
  return {
    id: r.id,
    holdingId: r.holding_id,
    paymentDate: r.payment_date,
    amount: Number(r.amount),
    currency: r.currency,
    yieldPct: r.yield_pct,
    frequency: r.frequency,
    incomeId: r.income_id,
  };
}

export async function listDividends(holdingId?: string, ctx?: AuthContext): Promise<Dividend[]> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);
  let query = supabase
    .from("dividends")
    .select("id,holding_id,payment_date,amount,currency,yield_pct,frequency,income_id")
    .in("user_id", memberIds)
    .order("payment_date", { ascending: false });
  if (holdingId) query = query.eq("holding_id", holdingId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToDividend);
}

export async function createDividend(input: DividendInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  const freq = input.frequency ?? "anual";
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const label = input.holdingLabel ?? input.holdingSymbol ?? "Dividendo";

  // La moneda la IMPONE el holding, no la elige quien llama. Este servicio guardaba
  // `input.currency` sin mirar la del holding, así que un formulario que precargara desde
  // el view-model convertido escribía el importe en la moneda principal con la etiqueta
  // nativa. Si además llega una moneda que contradice, se falla en vez de guardar callado
  // (mismo criterio que el pago de deuda en #474).
  const { data: hRow } = await supabase
    .from("investment_holdings")
    .select("currency")
    .eq("id", input.holdingId)
    .in("user_id", scope)
    .maybeSingle();
  const monedaDelHolding = hRow?.currency ?? input.currency;
  if (!monedaDelMovimientoEsCoherente(input.currency, monedaDelHolding)) {
    throw new Error(
      `El dividendo viene en ${input.currency} pero la inversión está en ${monedaDelHolding}.`,
    );
  }

  // 1) Inserta el dividendo SIN income_id: ya no se duplica en income_sources.
  //    Su renta vive en la transacción vinculada + la línea derivada.
  const { data: divRow, error: divErr } = await supabase
    .from("dividends")
    .insert({
      user_id: user.id,
      household_id,
      created_by: user.id,
      last_edited_by: user.id,
      holding_id: input.holdingId,
      payment_date: input.paymentDate,
      amount: input.amount,
      currency: monedaDelHolding,
      yield_pct: input.yieldPct ?? null,
      frequency: freq,
      income_id: null,
      transaction_id: null,
    })
    .select("id")
    .single();
  if (divErr) throw new Error(divErr.message);

  // 1b) Avanza el ANCLA del próximo pago si esta posición tiene dividendos
  //     configurados. Es lo que cierra el ciclo del recordatorio: sin esto, el
  //     aviso "¿te llegó el dividendo?" quedaría pegado en la fecha vieja aunque
  //     el usuario ya lo hubiera registrado. Best-effort: registrar el cobro no
  //     puede fallar porque no se pudo mover una fecha.
  try {
    const { data: cfg } = await supabase
      .from("investment_holdings")
      .select("pays_dividends,dividend_frequency,dividend_next_date")
      .eq("id", input.holdingId)
      .in("user_id", scope)
      .maybeSingle();
    if (cfg?.pays_dividends && esFrecuenciaPago(cfg.dividend_frequency)) {
      // Desde el DÍA SIGUIENTE al pago registrado: si se calculara desde la
      // misma fecha, `proximaFechaPago` devolvería esa misma fecha (es >= hoy)
      // y el ancla no avanzaría.
      const desde = sumarUnDia(input.paymentDate);
      const siguiente = proximaFechaPago(
        cfg.dividend_next_date ?? input.paymentDate,
        cfg.dividend_frequency,
        desde,
      );
      if (siguiente) {
        await supabase
          .from("investment_holdings")
          .update({ dividend_next_date: siguiente })
          .eq("id", input.holdingId)
          .in("user_id", scope);
      }
    }
  } catch {
    // no bloquea el registro del cobro.
  }

  // 2) Materializa la línea derivada de dividendos del periodo (promedio 12m,
  //    source_kind='dividend') y obtén su id para la barra "Recibido".
  const [py, pm] = input.paymentDate.split("-").map(Number);
  const period = monthPeriod(py!, pm!);
  await syncDerivedBudget(period);
  const { data: line } = await supabase
    .from("budget_items")
    .select("id")
    .in("user_id", scope)
    .eq("source_kind", "dividend")
    .eq("source_id", input.holdingId)
    .eq("period_month", period.month)
    .eq("period_year", period.year)
    .maybeSingle();

  // 3) El dividendo nace como transacción vinculada (ingreso, linked_kind='holding')
  //    atribuida a esa línea: llena "Recibido" SIN duplicar en income_sources.
  let txnId: string;
  try {
    txnId = await registerLinkedTransaction(
      dividendToTxn({
        holdingId: input.holdingId,
        label,
        currency: input.currency,
        paymentDate: input.paymentDate,
        amount: input.amount,
        categoryId: await getSystemCategoryId("inc_pasivo"),
        incomeSourceId: line?.id ?? null,
      }),
    );
  } catch (err) {
    // Compensación: quita el dividendo si el ledger falla.
    await supabase.from("dividends").delete().eq("id", divRow!.id).in("user_id", scope);
    throw err;
  }

  const { error: upErr } = await supabase
    .from("dividends")
    .update({ last_edited_by: user.id, transaction_id: txnId })
    .eq("id", divRow!.id)
    .in("user_id", scope);
  if (upErr) {
    await deleteLinkedTransaction(txnId);
    await supabase.from("dividends").delete().eq("id", divRow!.id).in("user_id", scope);
    throw new Error(upErr.message);
  }
}

export async function deleteDividend(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  // Lee income_id/transaction_id antes de borrar para limpiar lo vinculado.
  const { data: row } = await supabase
    .from("dividends")
    .select("income_id,transaction_id")
    .eq("id", id)
    .in("user_id", scope)
    .maybeSingle();

  const { error } = await supabase.from("dividends").delete().eq("id", id).in("user_id", scope);
  if (error) throw new Error(error.message);
  await logHouseholdDeletion(supabase, { userId: user.id, table: "dividends", rowId: id });

  if (row?.income_id) {
    await supabase.from("income_sources").delete().eq("id", row.income_id).in("user_id", scope);
  }
  if (row?.transaction_id) {
    // deleteLinkedTransaction registra por su cuenta el borrado de la transacción.
    await deleteLinkedTransaction(row.transaction_id);
  }
}

/**
 * Posiciones con dividendos configurados, con lo necesario para el recordatorio
 * de cobro: la config, la base del yield y la fecha del último pago YA
 * registrado (para no avisar de algo ya cobrado).
 *
 * Devuelve la forma que consume `detectDividendosPorCobrar`; el cálculo del
 * monto vive en el motor, no acá.
 */
export async function listDividendosPorCobrar(
  ctx?: AuthContext,
): Promise<import("@/lib/insights/dividendo-cobro").HoldingConDividendo[]> {
  const { db: supabase, userId } = await resolveAuth(ctx);
  const memberIds = await householdMemberIds(supabase, userId);

  const { data: holdings } = await supabase
    .from("investment_holdings")
    .select(
      "id,label,symbol,currency,quantity,average_cost,current_value_manual,pays_dividends,dividend_mode,dividend_yield_pct,dividend_amount,dividend_frequency,dividend_withholding_pct,dividend_next_date",
    )
    .in("user_id", memberIds)
    .eq("pays_dividends", true);
  if (!holdings || holdings.length === 0) return [];

  // Último pago registrado por posición, en UNA consulta: N+1 acá costaría una
  // query por holding en cada refresh de insights.
  const { data: pagos } = await supabase
    .from("dividends")
    .select("holding_id,payment_date")
    .in("user_id", memberIds)
    .in(
      "holding_id",
      holdings.map((h) => h.id),
    )
    .order("payment_date", { ascending: false });
  const ultimoPorHolding = new Map<string, string>();
  for (const p of pagos ?? []) {
    if (!ultimoPorHolding.has(p.holding_id)) ultimoPorHolding.set(p.holding_id, p.payment_date);
  }

  return holdings.map((h) => {
    const invertido = Number(h.quantity ?? 0) * Number(h.average_cost ?? 0);
    return {
      id: h.id,
      label: h.label ?? h.symbol ?? "tu posición",
      currency: h.currency,
      // Misma base que la proyección: el valor manual manda, si no lo invertido.
      base: Number(h.current_value_manual ?? 0) || invertido,
      paysDividends: h.pays_dividends ?? false,
      dividendMode: h.dividend_mode,
      dividendYieldPct: h.dividend_yield_pct == null ? null : Number(h.dividend_yield_pct),
      dividendAmount: h.dividend_amount == null ? null : Number(h.dividend_amount),
      dividendFrequency: h.dividend_frequency,
      dividendWithholdingPct:
        h.dividend_withholding_pct == null ? null : Number(h.dividend_withholding_pct),
      dividendNextDate: h.dividend_next_date,
      ultimoPagoRegistrado: ultimoPorHolding.get(h.id) ?? null,
    };
  });
}
