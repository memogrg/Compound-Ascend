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
        .update({ unit_price: price, expense_item_id: expenseId })
        .eq("id", reserved.id);
    } catch (err) {
      console.error(`[ensureMonthlyContributions] error en holding ${h.id}:`, err);
    }
  }
}
