import "server-only";

/** CRUD + matching de reglas de auto-categorización (transaction_rules). RLS. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { TransactionRuleRow } from "@/lib/supabase/database.types";
import type { RuleInput } from "@/modules/financial-base/schemas";

export type TransactionRule = {
  id: string;
  merchantPattern: string;
  suggestedCategoryId: string | null;
  suggestedAccountId: string | null;
  type: "income" | "expense";
  active: boolean;
  priority: number;
  /** Auto-vínculo (Fase 2): la regla puede fijar entidad además de categoría. */
  linkedKind: string | null;
  linkedId: string | null;
};

function rowToRule(r: TransactionRuleRow): TransactionRule {
  return {
    id: r.id,
    merchantPattern: r.merchant_pattern,
    suggestedCategoryId: r.suggested_category_id,
    suggestedAccountId: r.suggested_account_id,
    type: r.type as "income" | "expense",
    active: r.active,
    priority: r.priority ?? 0,
    linkedKind: r.linked_kind ?? null,
    linkedId: r.linked_id ?? null,
  };
}

export async function listRules(): Promise<TransactionRule[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // Mayor prioridad primero; a igual prioridad, la más reciente.
  const { data } = await supabase
    .from("transaction_rules")
    .select("*")
    .eq("user_id", user.id)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToRule);
}

export async function createRule(input: RuleInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("transaction_rules").insert({
    user_id: user.id,
    merchant_pattern: input.merchantPattern,
    suggested_category_id: input.suggestedCategoryId ?? null,
    suggested_account_id: input.suggestedAccountId ?? null,
    type: input.type,
    active: input.active,
    priority: input.priority ?? 0,
    linked_kind: input.linkedKind ?? null,
    linked_id: input.linkedId ?? null,
  });
}

export async function updateRule(id: string, input: RuleInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("transaction_rules")
    .update({
      merchant_pattern: input.merchantPattern,
      suggested_category_id: input.suggestedCategoryId ?? null,
      suggested_account_id: input.suggestedAccountId ?? null,
      type: input.type,
      active: input.active,
      priority: input.priority ?? 0,
      linked_kind: input.linkedKind ?? null,
      linked_id: input.linkedId ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function deleteRule(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("transaction_rules").delete().eq("id", id).eq("user_id", user.id);
}

/**
 * Busca la primera regla activa cuyo patrón (substring, case-insensitive) esté
 * contenido en el texto del comercio. Determinista, sin IA.
 */
export async function findMatchingRule(
  merchant: string | null | undefined,
  type: "income" | "expense",
): Promise<TransactionRule | null> {
  if (!merchant) return null;
  const haystack = merchant.toLowerCase();
  const rules = await listRules();
  return (
    rules.find(
      (r) => r.active && r.type === type && haystack.includes(r.merchantPattern.toLowerCase()),
    ) ?? null
  );
}
