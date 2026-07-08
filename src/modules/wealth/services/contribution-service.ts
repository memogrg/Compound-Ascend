"use server";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMarketPrice, type AssetType as MarketAssetType } from "@/lib/market-data";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { registerPurchaseExpense } from "./holdings-service";

const MARKET_TYPE: Partial<Record<string, MarketAssetType>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

/**
 * Auto-registra el aporte mensual de cada holding recurrente cotizado que aún no
 * lo tenga este mes. Reserva primero la fila (el índice único serializa y evita
 * doble merge), luego mergea al precio en vivo y crea el gasto del mes. Best-effort
 * por holding: una falla no bloquea a las demás.
 */
export async function ensureMonthlyContributions(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;

  const { data: holdings, error } = await supabase
    .from("investment_holdings")
    .select(
      "id, symbol, asset_type, currency, label, quantity, average_cost, monthly_contribution, household_id",
    )
    .eq("user_id", user.id)
    .eq("is_recurring", true)
    .in("asset_type", ["etf", "accion", "cripto"])
    .gt("monthly_contribution", 0);
  if (error || !holdings) return;

  let rates: Awaited<ReturnType<typeof getFxRates>> | null = null;

  for (const h of holdings) {
    try {
      const marketType = MARKET_TYPE[h.asset_type];
      if (!marketType || !h.symbol) continue;

      // Reservar el aporte del mes ANTES de mergear. El índice único
      // (holding_id, period_year, period_month) serializa: si otra carga ya lo
      // hizo, el insert da 23505 y saltamos (sin doble merge).
      const { data: reserved, error: insErr } = await supabase
        .from("holding_contributions")
        .insert({
          holding_id: h.id,
          user_id: user.id,
          household_id: h.household_id,
          period_year: periodYear,
          period_month: periodMonth,
          amount: Number(h.monthly_contribution),
          currency: h.currency,
          status: "auto",
        })
        .select("id")
        .maybeSingle();
      if (insErr) {
        if (insErr.code !== "23505") {
          console.error(
            `[ensureMonthlyContributions] reserva falló (${h.id}): ${insErr.code} ${insErr.message}`,
          );
        }
        continue;
      }
      if (!reserved) continue;

      // Precio en vivo en la moneda del holding.
      const quote = await getMarketPrice(h.symbol, marketType);
      if (!quote || quote.price <= 0) {
        // Sin precio: dejar 'pendiente' para que el usuario ingrese el precio (2c).
        await supabase
          .from("holding_contributions")
          .update({ status: "pendiente" })
          .eq("id", reserved.id);
        continue;
      }
      let price = quote.price;
      if (quote.currency !== h.currency) {
        if (!rates) rates = await getFxRates();
        price = convertCurrency(quote.price, quote.currency, h.currency, rates);
      }
      if (price <= 0) continue;

      // Merge ponderado (misma fórmula que createHolding).
      const qty = Number(h.monthly_contribution) / price;
      const prevQty = Number(h.quantity ?? 0);
      const prevAvg = Number(h.average_cost ?? 0);
      const newQty = prevQty + qty;
      const newAvg = newQty > 0 ? (prevQty * prevAvg + qty * price) / newQty : price;

      const { error: updErr } = await supabase
        .from("investment_holdings")
        .update({ quantity: newQty, average_cost: newAvg, cost_basis: newQty * newAvg })
        .eq("id", h.id)
        .eq("user_id", user.id);
      if (updErr) {
        console.error(`[ensureMonthlyContributions] merge falló (${h.id}): ${updErr.message}`);
        continue;
      }

      // Gasto del mes = el aporte (monto fijo).
      const expenseId = await registerPurchaseExpense({
        holdingId: h.id,
        label: h.label ?? h.symbol,
        currency: h.currency,
        purchaseDate: `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`,
        amount: Number(h.monthly_contribution),
        verb: "Aporte",
      });

      await supabase
        .from("holding_contributions")
        .update({ unit_price: price, transaction_id: expenseId })
        .eq("id", reserved.id);
    } catch (err) {
      console.error(`[ensureMonthlyContributions] error en holding ${h.id}:`, err);
    }
  }
}

export type OpenContribution = {
  id: string;
  holdingId: string;
  label: string;
  amount: number;
  unitPrice: number | null;
  currency: string;
  status: string;
};

/** Aportes abiertos (auto/pendiente) del mes en curso, para el render de la brecha. */
export async function listOpenContributions(): Promise<OpenContribution[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const { data, error } = await supabase
    .from("holding_contributions")
    .select("id, holding_id, amount, unit_price, currency, status")
    .eq("user_id", user.id)
    .eq("period_year", now.getFullYear())
    .eq("period_month", now.getMonth() + 1)
    .in("status", ["auto", "pendiente"]);
  if (error || !data) return [];
  const holdingIds = [...new Set(data.map((r) => r.holding_id))];
  const labelById = new Map<string, string>();
  if (holdingIds.length > 0) {
    const { data: hs } = await supabase
      .from("investment_holdings")
      .select("id, label")
      .in("id", holdingIds);
    for (const h of hs ?? []) labelById.set(h.id, h.label ?? "tu inversión");
  }
  return data.map((r) => ({
    id: r.id,
    holdingId: r.holding_id,
    label: labelById.get(r.holding_id) ?? "tu inversión",
    amount: Number(r.amount),
    unitPrice: r.unit_price !== null ? Number(r.unit_price) : null,
    currency: r.currency,
    status: r.status,
  }));
}

/**
 * Ajusta el precio de un aporte del mes: revierte el aporte al precio viejo y lo
 * re-mergea al nuevo. El monto es fijo, así que solo cambian cantidad/costo del
 * holding; el gasto vinculado (transactions) no se toca. Marca 'confirmado'.
 * (El promedio ponderado es order-independent: revertir es correcto aunque haya
 * habido otras compras entremedio.)
 */
export async function adjustContributionPrice(
  contributionId: string,
  newPrice: number,
): Promise<void> {
  if (!(newPrice > 0)) throw new Error("El precio debe ser mayor a 0.");
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: c, error: cErr } = await supabase
    .from("holding_contributions")
    .select("id, holding_id, amount, unit_price")
    .eq("id", contributionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (cErr || !c) throw new Error("Aporte no encontrado.");

  const { data: h, error: hErr } = await supabase
    .from("investment_holdings")
    .select("id, quantity, average_cost")
    .eq("id", c.holding_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (hErr || !h) throw new Error("Holding no encontrado.");

  const amount = Number(c.amount);
  const oldPrice = Number(c.unit_price ?? 0);
  const curQty = Number(h.quantity ?? 0);
  const curAvg = Number(h.average_cost ?? 0);

  // Quitar el aporte viejo del promedio (si estaba mergeado a un precio).
  const oldQty = oldPrice > 0 ? amount / oldPrice : 0;
  const baseQty = curQty - oldQty;
  const baseAvg = baseQty > 0 ? (curQty * curAvg - oldQty * oldPrice) / baseQty : 0;

  // Re-mergear al precio nuevo.
  const newQty = amount / newPrice;
  const finalQty = baseQty + newQty;
  const finalAvg = finalQty > 0 ? (baseQty * baseAvg + newQty * newPrice) / finalQty : newPrice;

  const { error: updErr } = await supabase
    .from("investment_holdings")
    .update({ quantity: finalQty, average_cost: finalAvg, cost_basis: finalQty * finalAvg })
    .eq("id", h.id)
    .eq("user_id", user.id);
  if (updErr) throw new Error(updErr.message);

  const { error: setErr } = await supabase
    .from("holding_contributions")
    .update({ unit_price: newPrice, status: "confirmado", updated_at: new Date().toISOString() })
    .eq("id", c.id)
    .eq("user_id", user.id);
  if (setErr) throw new Error(setErr.message);
}

/**
 * Registra la prima mensual de cada plan a plazo (recurrente) como gasto del mes y
 * la suma a lo invertido — acotado al maturity_date. Después del vencimiento no
 * cuenta más. Sin precio ni merge (el valor del plan es manual, del estado de
 * cuenta). El índice único (holding_id, period) serializa; best-effort por plan.
 */
export async function ensureMonthlyPremiums(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const now = new Date();
  const periodYear = now.getFullYear();
  const periodMonth = now.getMonth() + 1;
  const periodStart = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;

  const { data: plans, error } = await supabase
    .from("investment_holdings")
    .select("id, currency, label, cost_basis, monthly_contribution, household_id")
    .eq("user_id", user.id)
    .eq("is_recurring", true)
    .eq("category", "plan_inversion")
    .gt("monthly_contribution", 0)
    .or(`maturity_date.is.null,maturity_date.gte.${periodStart}`); // acota al vencimiento
  if (error || !plans) return;

  for (const p of plans) {
    try {
      const premium = Number(p.monthly_contribution);
      if (!(premium > 0)) continue;

      // Reservar la prima del mes (idempotente por el índice único).
      const { data: reserved, error: insErr } = await supabase
        .from("holding_contributions")
        .insert({
          holding_id: p.id,
          user_id: user.id,
          household_id: p.household_id,
          period_year: periodYear,
          period_month: periodMonth,
          amount: premium,
          currency: p.currency,
          status: "confirmado", // prima fija: no hay precio que confirmar
        })
        .select("id")
        .maybeSingle();
      if (insErr) {
        if (insErr.code !== "23505") {
          console.error(`[ensureMonthlyPremiums] reserva falló (${p.id}): ${insErr.code} ${insErr.message}`);
        }
        continue;
      }
      if (!reserved) continue;

      // La prima aumenta lo invertido (primas pagadas). El valor es manual (P4).
      const newCostBasis = Number(p.cost_basis ?? 0) + premium;
      const { error: updErr } = await supabase
        .from("investment_holdings")
        .update({ cost_basis: newCostBasis, average_cost: newCostBasis, quantity: 1 })
        .eq("id", p.id)
        .eq("user_id", user.id);
      if (updErr) {
        console.error(`[ensureMonthlyPremiums] update falló (${p.id}): ${updErr.message}`);
        continue;
      }

      // Gasto del mes = la prima.
      const expenseId = await registerPurchaseExpense({
        holdingId: p.id,
        label: p.label ?? "Plan a plazo",
        currency: p.currency,
        purchaseDate: periodStart,
        amount: premium,
        verb: "Prima",
      });

      await supabase
        .from("holding_contributions")
        .update({ transaction_id: expenseId })
        .eq("id", reserved.id);
    } catch (err) {
      console.error(`[ensureMonthlyPremiums] error en plan ${p.id}:`, err);
    }
  }
}

/**
 * Adelanta cuotas de un plan: pre-crea las filas de los próximos meses no pagados
 * (para que ensureMonthlyPremiums no los recobre), suma a lo invertido y registra
 * UN solo gasto por el total adelantado. Tope: no pasa el maturity_date.
 */
export async function advancePremiums(
  holdingId: string,
  globalAmount: number,
): Promise<{ advanced: number }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: p } = await supabase
    .from("investment_holdings")
    .select("id, currency, label, cost_basis, monthly_contribution, maturity_date, household_id")
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .eq("category", "plan_inversion")
    .maybeSingle();
  const prima = Number(p?.monthly_contribution ?? 0);
  if (!p || !(prima > 0)) throw new Error("Plan no válido.");
  const cuotas = Math.round(globalAmount / prima);
  if (cuotas < 1) throw new Error("El monto no cubre ni una cuota.");

  // Arrancar desde el mes siguiente a la última cuota registrada (o el mes actual).
  const { data: last } = await supabase
    .from("holding_contributions")
    .select("period_year, period_month")
    .eq("holding_id", holdingId)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  let y: number;
  let m: number;
  if (last) {
    y = last.period_year;
    m = last.period_month + 1;
    if (m > 12) { m = 1; y += 1; }
  } else {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
  }

  const maturity = p.maturity_date ? new Date(p.maturity_date) : null;
  let advanced = 0;
  for (let i = 0; i < cuotas; i++) {
    const monthStart = new Date(`${y}-${String(m).padStart(2, "0")}-01`);
    if (maturity && monthStart > maturity) break; // tope al vencimiento
    const { error } = await supabase.from("holding_contributions").insert({
      holding_id: holdingId,
      user_id: user.id,
      household_id: p.household_id,
      period_year: y,
      period_month: m,
      amount: prima,
      currency: p.currency,
      status: "confirmado",
    });
    if (!error) advanced += 1;
    else if (error.code !== "23505") throw new Error(error.message); // ya existe → saltar
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  if (advanced === 0) return { advanced: 0 };

  const total = advanced * prima;
  const newCostBasis = Number(p.cost_basis ?? 0) + total;
  await supabase
    .from("investment_holdings")
    .update({ cost_basis: newCostBasis, average_cost: newCostBasis, quantity: 1 })
    .eq("id", holdingId)
    .eq("user_id", user.id);

  const now = new Date();
  await registerPurchaseExpense({
    holdingId,
    label: p.label ?? "Plan a plazo",
    currency: p.currency,
    purchaseDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    amount: total,
    verb: "Adelanto",
  });

  return { advanced };
}
