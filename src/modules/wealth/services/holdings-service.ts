import "server-only";

/** CRUD de posiciones (investment_holdings). Respeta RLS. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { HoldingInput } from "@/modules/wealth/schemas";
import type { Holding } from "@/modules/wealth/types";
import type { AssetType } from "@/modules/wealth/types";

function rowToHolding(r: {
  id: string;
  investment_id: string | null;
  symbol: string;
  asset_type: string;
  quantity: number;
  average_cost: number;
  purchase_date: string | null;
  broker: string | null;
  currency: string;
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
  };
}

export async function listHoldings(): Promise<Holding[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("investment_holdings")
    .select("id,investment_id,symbol,asset_type,quantity,average_cost,purchase_date,broker,currency")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToHolding);
}

export async function createHolding(input: HoldingInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const symbol = input.symbol.toUpperCase();

  // If the user already holds this symbol+assetType+currency, merge via weighted average.
  const { data: existing } = await supabase
    .from("investment_holdings")
    .select("id, quantity, average_cost, broker")
    .eq("user_id", user.id)
    .eq("symbol", symbol)
    .eq("asset_type", input.assetType)
    .eq("currency", input.currency)
    .maybeSingle();

  if (existing) {
    const prevQty = Number(existing.quantity ?? 0);
    const prevAvg = Number(existing.average_cost ?? 0);
    const newQty = prevQty + input.quantity;
    const newAvg = newQty > 0
      ? (prevQty * prevAvg + input.quantity * input.averageCost) / newQty
      : input.averageCost;
    await supabase
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
    return;
  }

  await supabase.from("investment_holdings").insert({
    user_id: user.id,
    investment_id: input.investmentId ?? null,
    symbol,
    asset_type: input.assetType,
    quantity: input.quantity,
    average_cost: input.averageCost,
    cost_basis: input.quantity * input.averageCost,
    purchase_date: input.purchaseDate ?? null,
    broker: input.broker ?? null,
    currency: input.currency,
  });
}

export async function updateHolding(id: string, input: HoldingInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("investment_holdings")
    .update({
      investment_id: input.investmentId ?? null,
      symbol: input.symbol.toUpperCase(),
      asset_type: input.assetType,
      quantity: input.quantity,
      average_cost: input.averageCost,
      cost_basis: input.quantity * input.averageCost,
      purchase_date: input.purchaseDate ?? null,
      broker: input.broker ?? null,
      currency: input.currency,
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function deleteHolding(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("investment_holdings").delete().eq("id", id).eq("user_id", user.id);
}
