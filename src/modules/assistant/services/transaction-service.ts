import "server-only";

/** Crea transacciones (respeta RLS). Siempre marcadas como confirmadas por el usuario. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { TransactionInput } from "@/modules/assistant/schemas";

export async function createTransaction(input: TransactionInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("transactions").insert({
    user_id: user.id,
    kind: input.kind,
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    occurred_on: input.occurredOn,
    source: input.source,
    confirmed_by_user: true,
  });
}
