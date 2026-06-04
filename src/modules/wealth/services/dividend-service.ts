import "server-only";

/** CRUD de dividendos. Respeta RLS. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { DividendInput } from "@/modules/wealth/schemas";
import type { Dividend } from "@/modules/wealth/types";

function rowToDividend(r: {
  id: string;
  holding_id: string;
  payment_date: string;
  amount: number;
  currency: string;
}): Dividend {
  return {
    id: r.id,
    holdingId: r.holding_id,
    paymentDate: r.payment_date,
    amount: Number(r.amount),
    currency: r.currency,
  };
}

export async function listDividends(holdingId?: string): Promise<Dividend[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("dividends")
    .select("id,holding_id,payment_date,amount,currency")
    .eq("user_id", user.id)
    .order("payment_date", { ascending: false });
  if (holdingId) query = query.eq("holding_id", holdingId);
  const { data } = await query;
  return (data ?? []).map(rowToDividend);
}

export async function createDividend(input: DividendInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("dividends").insert({
    user_id: user.id,
    holding_id: input.holdingId,
    payment_date: input.paymentDate,
    amount: input.amount,
    currency: input.currency,
  });
}

export async function deleteDividend(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("dividends").delete().eq("id", id).eq("user_id", user.id);
}
