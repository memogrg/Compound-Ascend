import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { Holding } from "@/modules/wealth/types";

export type HistoryPoint = { date: string; value: number };
export type Period = "1M" | "3M" | "1Y" | "all";

function periodStart(period: Period): string {
  const d = new Date();
  switch (period) {
    case "1M": d.setMonth(d.getMonth() - 1); break;
    case "3M": d.setMonth(d.getMonth() - 3); break;
    case "1Y": d.setFullYear(d.getFullYear() - 1); break;
    case "all": d.setFullYear(2015); break;
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

  const since = periodStart(period);
  const { data: snaps } = await supabase
    .from("portfolio_snapshots")
    .select("date, investment_value")
    .eq("user_id", user.id)
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
    currentPrice !== null ? holding.quantity * currentPrice : (holding.currentValueManual ?? costBasis);

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
