import "server-only";
import { householdMemberIds } from "@/lib/household/active";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { Holding } from "@/modules/wealth/types";

export type HistoryPoint = { date: string; value: number };
export type Period = "1M" | "3M" | "1Y" | "all";

function periodStart(period: Period): string {
  const d = new Date();
  switch (period) {
    case "1M":
      d.setMonth(d.getMonth() - 1);
      break;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      break;
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "all":
      d.setFullYear(2015);
      break;
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Historial de valor de una posición.
 * Fuente primaria: portfolio_snapshots (valor de cartera total).
 * Si el snapshot existe, devuelve investment_value proporcional al peso del holding.
 * Si no, genera una serie sintética lineal entre costo de compra y valor actual.
 */
export async function getHoldingHistory(
  holding: Holding,
  currentPrice: number | null,
  period: Period = "all",
): Promise<HistoryPoint[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const memberIds = await householdMemberIds(supabase, user.id);
  const since = periodStart(period);
  const { data: snaps } = await supabase
    .from("portfolio_snapshots")
    .select("date, investment_value")
    .in("user_id", memberIds)
    .gte("date", since)
    .order("date", { ascending: true });

  if (snaps && snaps.length >= 3) {
    return snaps.map((s) => ({
      date: s.date as string,
      value: Number(s.investment_value),
    }));
  }

  // Fallback sintético: interpolación lineal desde costo a valor actual.
  // No cotizados: valor manual del usuario (no precio×cantidad).
  const costBasis = holding.quantity * holding.averageCost;
  const currentValue =
    currentPrice !== null
      ? holding.quantity * currentPrice
      : (holding.currentValueManual ?? costBasis);

  const purchaseDate = holding.purchaseDate
    ? new Date(holding.purchaseDate)
    : new Date(Date.now() - 180 * 24 * 3600_000);
  const startDate = new Date(Math.max(new Date(since).getTime(), purchaseDate.getTime()));
  const today = new Date();
  const spanMs = today.getTime() - startDate.getTime();
  if (spanMs <= 0) return [{ date: today.toISOString().slice(0, 10), value: currentValue }];

  const N = Math.min(30, Math.max(2, Math.floor(spanMs / (1000 * 3600 * 24 * 7))));
  const points: HistoryPoint[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const date = new Date(startDate.getTime() + t * spanMs);
    const value = costBasis + (currentValue - costBasis) * t;
    points.push({ date: date.toISOString().slice(0, 10), value: Math.max(0, value) });
  }
  return points;
}

export type HoldingPurchase = {
  id: string;
  occurredOn: string;
  amount: number;
  quantity: number;
  currency: string;
};

/** Compras de un holding (investment_transactions, tx_type='compra'), cronológico. */
export async function listHoldingPurchases(holdingId: string): Promise<HoldingPurchase[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data, error } = await supabase
    .from("investment_transactions")
    .select("id, amount, quantity, currency, occurred_on")
    .in("user_id", memberIds)
    .eq("holding_id", holdingId)
    .eq("tx_type", "compra")
    .order("occurred_on", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    occurredOn: r.occurred_on,
    amount: Number(r.amount),
    quantity: Number(r.quantity ?? 0),
    currency: r.currency,
  }));
}

export type HoldingValuation = {
  id: string;
  asOf: string;
  value: number;
  currency: string;
};

export async function listHoldingValuations(holdingId: string): Promise<HoldingValuation[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data, error } = await supabase
    .from("holding_valuations")
    .select("id, as_of, value, currency")
    .in("user_id", memberIds)
    .eq("holding_id", holdingId)
    .order("as_of", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, asOf: r.as_of, value: Number(r.value), currency: r.currency }));
}

/** Guarda un valor del estado de cuenta y actualiza el valor actual del plan al más reciente. */
export async function recordHoldingValuation(
  holdingId: string,
  asOf: string,
  value: number,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: h } = await supabase
    .from("investment_holdings")
    .select("household_id, currency")
    .eq("id", holdingId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { error } = await supabase.from("holding_valuations").upsert(
    {
      holding_id: holdingId,
      user_id: user.id,
      household_id: h?.household_id ?? null,
      as_of: asOf,
      value,
      currency: h?.currency ?? "USD",
    },
    { onConflict: "holding_id,as_of" },
  );
  if (error) throw new Error(error.message);

  const { data: latest } = await supabase
    .from("holding_valuations")
    .select("value")
    .eq("holding_id", holdingId)
    .eq("user_id", user.id)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest) {
    await supabase
      .from("investment_holdings")
      .update({ current_value_manual: Number(latest.value) })
      .eq("id", holdingId)
      .eq("user_id", user.id);
  }
}
