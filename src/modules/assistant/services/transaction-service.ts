import "server-only";

/** Crea transacciones (respeta RLS). Siempre marcadas como confirmadas por el usuario. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import type { TransactionInput } from "@/modules/assistant/schemas";

export async function createTransaction(input: TransactionInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  await supabase.from("transactions").insert({
    user_id: user.id,
    household_id,
    kind: input.kind,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    occurred_on: input.occurredOn,
    source: input.source,
    confirmed_by_user: true,
  });
}
