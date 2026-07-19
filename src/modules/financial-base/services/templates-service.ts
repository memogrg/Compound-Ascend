import "server-only";
import { householdMemberIds } from "@/lib/household/active";

/**
 * Plantillas / favoritos de transacción: permiten registrar en 1 clic
 * (p. ej. "Salario mensual", "Pago hipoteca", "Compra supermercado"). RLS.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { TransactionTemplateRow } from "@/lib/supabase/database.types";
import type { TemplateInput } from "@/modules/financial-base/schemas";
import type { TxnKind } from "@/modules/financial-base/types";

export type TransactionTemplate = {
  id: string;
  name: string;
  kind: TxnKind;
  amount: number | null;
  currency: string;
  categoryId: string | null;
  accountId: string | null;
  merchantOrSource: string | null;
  note: string | null;
  isFavorite: boolean;
  sortOrder: number;
  useCount: number;
};

function rowToTemplate(r: TransactionTemplateRow): TransactionTemplate {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind as TxnKind,
    amount: r.amount === null ? null : Number(r.amount),
    currency: r.currency,
    categoryId: r.category_id,
    accountId: r.account_id,
    merchantOrSource: r.merchant_or_source,
    note: r.note,
    isFavorite: r.is_favorite,
    sortOrder: r.sort_order,
    useCount: r.use_count,
  };
}

export async function listTemplates(): Promise<TransactionTemplate[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("transaction_templates")
    .select("*")
    .in("user_id", memberIds)
    .order("sort_order", { ascending: true })
    .order("use_count", { ascending: false });
  return (data ?? []).map(rowToTemplate);
}

export async function createTemplate(input: TemplateInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("transaction_templates").insert({
    user_id: user.id,
    name: input.name,
    kind: input.kind,
    amount: input.amount ?? null,
    currency: input.currency,
    category_id: input.categoryId ?? null,
    account_id: input.accountId ?? null,
    merchant_or_source: input.merchantOrSource ?? null,
    note: input.note ?? null,
    is_favorite: input.isFavorite ?? true,
    sort_order: input.sortOrder ?? 0,
  });
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("transaction_templates")
    .update({
      name: input.name,
      kind: input.kind,
      amount: input.amount ?? null,
      currency: input.currency,
      category_id: input.categoryId ?? null,
      account_id: input.accountId ?? null,
      merchant_or_source: input.merchantOrSource ?? null,
      note: input.note ?? null,
      is_favorite: input.isFavorite ?? true,
      sort_order: input.sortOrder ?? 0,
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function deleteTemplate(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("transaction_templates").delete().eq("id", id).eq("user_id", user.id);
}

/** Marca uso (telemetría suave para ordenar por frecuencia). */
export async function touchTemplate(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("transaction_templates")
    .select("use_count")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  await supabase
    .from("transaction_templates")
    .update({ use_count: (data?.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
}
