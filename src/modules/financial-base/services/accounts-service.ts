import "server-only";
import { householdMemberIds } from "@/lib/household/active";

/** CRUD de cuentas / métodos de pago (respeta RLS). */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { Account, AccountKind } from "@/modules/financial-base/types";
import type { AccountInput } from "@/modules/financial-base/schemas";
import type { AccountRow } from "@/lib/supabase/database.types";

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as AccountKind,
    currency: r.currency,
    isDefault: r.is_default,
  };
}

export async function listAccounts(): Promise<Account[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("accounts")
    .select("*")
    .in("user_id", memberIds)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  return (data ?? []).map(rowToAccount);
}

export async function getDefaultAccount(): Promise<Account | null> {
  const accounts = await listAccounts();
  return accounts.find((a) => a.isDefault) ?? accounts[0] ?? null;
}

export async function createAccount(input: AccountInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  if (input.isDefault) {
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", user.id);
  }
  await supabase.from("accounts").insert({
    user_id: user.id,
    name: input.name,
    kind: input.kind,
    currency: input.currency,
    is_default: input.isDefault,
  });
}

export async function updateAccount(id: string, input: AccountInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  if (input.isDefault) {
    await supabase.from("accounts").update({ is_default: false }).eq("user_id", user.id);
  }
  await supabase
    .from("accounts")
    .update({
      name: input.name,
      kind: input.kind,
      currency: input.currency,
      is_default: input.isDefault,
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function deleteAccount(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("accounts").delete().eq("id", id).eq("user_id", user.id);
}
