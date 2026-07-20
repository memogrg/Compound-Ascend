import "server-only";

/** CRUD + matching de reglas de auto-categorización (transaction_rules). RLS. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
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
  // NO se registra en el log del hogar: las reglas son automatización PERSONAL
  // (siguen por user_id, no se comparten), así que borrar la propia no es una
  // acción sobre datos del hogar.
}

/**
 * UPSERT de la regla de un comercio: si ya existe una regla ACTIVA del mismo tipo cuyo
 * patrón coincide EXACTAMENTE (igualdad case-insensitive, no substring) con `merchant`,
 * solo le cambia la categoría sugerida (sin duplicar ni pisar reglas más genéricas);
 * si no, crea una nueva. La igualdad exacta —en vez de substring como el matching— evita
 * que re-clasificar "Starbucks" reescriba una regla más amplia como "Starbucks Centro".
 */
export async function upsertRuleForMerchant(
  merchant: string,
  type: "income" | "expense",
  categoryId: string,
): Promise<void> {
  const target = merchant.trim().toLowerCase();
  const rules = await listRules();
  const existing = rules.find(
    (r) => r.active && r.type === type && r.merchantPattern.trim().toLowerCase() === target,
  );
  if (existing) {
    await updateRule(existing.id, {
      merchantPattern: existing.merchantPattern,
      type: existing.type,
      suggestedCategoryId: categoryId,
      suggestedAccountId: existing.suggestedAccountId,
      active: existing.active,
      priority: existing.priority,
      linkedKind: existing.linkedKind as RuleInput["linkedKind"],
      linkedId: existing.linkedId,
    });
    return;
  }
  await createRule({
    merchantPattern: merchant,
    type,
    suggestedCategoryId: categoryId,
    active: true,
    priority: 0,
  });
}

/**
 * Variante de `upsertRuleForMerchant` para el WEBHOOK (service-role, sin sesión): lee y
 * escribe las reglas de `userId`. Mismo criterio de igualdad EXACTA (case-insensitive, no
 * substring) para no pisar reglas más genéricas. Solo cambia la categoría sugerida.
 */
export async function upsertRuleForUser(
  userId: string,
  merchant: string,
  type: "income" | "expense",
  categoryId: string,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const target = merchant.trim().toLowerCase();
  const { data } = await supabase
    .from("transaction_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true);
  const existing = (data ?? [])
    .map(rowToRule)
    .find((r) => r.type === type && r.merchantPattern.trim().toLowerCase() === target);
  if (existing) {
    await supabase
      .from("transaction_rules")
      .update({ suggested_category_id: categoryId })
      .eq("id", existing.id)
      .eq("user_id", userId);
    return;
  }
  await supabase.from("transaction_rules").insert({
    user_id: userId,
    merchant_pattern: merchant,
    suggested_category_id: categoryId,
    suggested_account_id: null,
    type,
    active: true,
    priority: 0,
    linked_kind: null,
    linked_id: null,
  });
}

/**
 * Matching PURO: primera regla activa del tipo cuyo patrón (substring,
 * case-insensitive) esté contenido en el texto del comercio. Determinista, sin IA.
 * Las reglas vienen ya ordenadas (mayor prioridad / más reciente primero).
 */
export function pickMatchingRule(
  rules: TransactionRule[],
  merchant: string | null | undefined,
  type: "income" | "expense",
): TransactionRule | null {
  if (!merchant) return null;
  const haystack = merchant.toLowerCase();
  return (
    rules.find(
      (r) => r.active && r.type === type && haystack.includes(r.merchantPattern.toLowerCase()),
    ) ?? null
  );
}

/** Regla que matchea para el usuario de sesión (RLS). */
export async function findMatchingRule(
  merchant: string | null | undefined,
  type: "income" | "expense",
): Promise<TransactionRule | null> {
  if (!merchant) return null;
  return pickMatchingRule(await listRules(), merchant, type);
}

/**
 * Igual que findMatchingRule pero para el WEBHOOK (service-role, sin sesión): lee
 * las reglas ACTIVAS de `userId` y aplica el matching puro. Así WhatsApp/ingesta
 * auto-categorizan usando las reglas que el usuario crea en "Por clasificar"/web.
 */
export async function findMatchingRuleForUser(
  userId: string,
  merchant: string | null | undefined,
  type: "income" | "expense",
): Promise<TransactionRule | null> {
  if (!merchant) return null;
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("transaction_rules")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  return pickMatchingRule((data ?? []).map(rowToRule), merchant, type);
}
