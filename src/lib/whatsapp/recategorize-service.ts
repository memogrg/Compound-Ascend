import "server-only";

/**
 * Re-clasificar el ÚLTIMO movimiento del usuario desde WhatsApp (comando "mover a <sobre>").
 * SERVICE ROLE (omite RLS): el webhook no tiene sesión. Resuelve el sobre por nombre entre
 * las categorías HOJA activas visibles (propias del usuario + las del sistema) de la
 * naturaleza correcta, y opcionalmente actualiza/crea la regla del comercio (upsert).
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { upsertRuleForUser } from "@/modules/financial-base/services/rules-service";
import { categoryMatchesKind } from "@/modules/financial-base/engine/classify";
import { normalize } from "@/lib/ai/biblia-knowledge";

// "mover/cambiar/recategorizar [a] <sobre>" → re-clasifica la última transacción.
const MOVE_RE = /^(?:mover|cambiar|recategoriza(?:r)?)\s+(?:a\s+)?(.+)$/i;
// Palabras que, dentro del comando, piden además actualizar/crear la regla del comercio.
const ALWAYS_RE = /\b(siempre|a\s+futuro(?:s)?|para\s+siempre|de\s+ahora\s+en\s+adelante)\b/gi;

/**
 * Parsea el comando "mover a <sobre> [siempre]". Devuelve el sobre limpio y si pidió tocar
 * la regla ("siempre"/"a futuro"), o null si no es un comando de mover. Puro y testeable.
 */
export function parseMoveCommand(body: string): { sobre: string; alsoRule: boolean } | null {
  const m = body.trim().match(MOVE_RE);
  if (!m) return null;
  const raw = m[1]!.trim();
  const sobre = raw.replace(ALWAYS_RE, "").trim();
  return { sobre, alsoRule: sobre.length !== raw.length };
}

export type LastTransaction = {
  id: string;
  merchant: string | null;
  kind: "gasto" | "ingreso";
};

export type ResolveCategory =
  | { status: "ok"; categoryId: string; categoryName: string }
  | { status: "ambiguous"; options: string[] }
  | { status: "none" };

export type MoveResult =
  | { status: "ok"; categoryName: string; merchant: string | null; ruleUpdated: boolean }
  | { status: "ambiguous"; options: string[] }
  | { status: "not_found"; name: string }
  | { status: "no_txn" }
  | { status: "error" };

/** Última transacción gasto/ingreso del usuario (más reciente por created_at). */
export async function getLastTransaction(userId: string): Promise<LastTransaction | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, merchant_or_source, kind")
    .eq("user_id", userId)
    .in("kind", ["gasto", "ingreso"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    merchant: data.merchant_or_source ?? null,
    kind: data.kind === "ingreso" ? "ingreso" : "gasto",
  };
}

/**
 * Resuelve un sobre por nombre entre las hojas activas visibles (user_id=userId OR null) de
 * la naturaleza de `kind`. Prioriza igualdad exacta (normalizada); si no, "incluye". Devuelve
 * ambiguous con las opciones cuando hay más de un candidato.
 */
export async function resolveCategoryByName(
  userId: string,
  name: string,
  kind: "gasto" | "ingreso",
): Promise<ResolveCategory> {
  const target = normalize(name.trim());
  if (!target) return { status: "none" };

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("expense_categories")
    .select("id, name, parent_id, category_type, is_active, user_id")
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq("is_active", true);

  const rows = data ?? [];
  // Hoja = no es padre de ninguna otra categoría activa visible.
  const parentIds = new Set(rows.map((c) => c.parent_id).filter(Boolean));
  const leaves = rows.filter(
    (c) => !parentIds.has(c.id) && categoryMatchesKind(c.category_type, kind),
  );

  const exact = leaves.filter((c) => normalize(c.name) === target);
  const pool = exact.length > 0 ? exact : leaves.filter((c) => normalize(c.name).includes(target));

  if (pool.length === 0) return { status: "none" };
  if (pool.length > 1) return { status: "ambiguous", options: pool.map((c) => c.name) };
  const only = pool[0]!;
  return { status: "ok", categoryId: only.id, categoryName: only.name };
}

/**
 * Re-clasifica la última transacción al sobre `name`. Si `alsoRule` y hay comercio, además
 * hace upsert de la regla (igualdad exacta) para que los próximos de ese comercio caigan
 * solos. Devuelve un resultado explicable cuando no hay txn, no resuelve o es ambiguo.
 */
export async function moveLastTransaction(
  userId: string,
  name: string,
  alsoRule: boolean,
): Promise<MoveResult> {
  const last = await getLastTransaction(userId);
  if (!last) return { status: "no_txn" };

  const resolved = await resolveCategoryByName(userId, name, last.kind);
  if (resolved.status === "ambiguous") return { status: "ambiguous", options: resolved.options };
  if (resolved.status === "none") return { status: "not_found", name: name.trim() };

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: resolved.categoryId })
    .eq("id", last.id)
    .eq("user_id", userId);
  if (error) return { status: "error" };

  let ruleUpdated = false;
  if (alsoRule && last.merchant) {
    try {
      await upsertRuleForUser(
        userId,
        last.merchant,
        last.kind === "gasto" ? "expense" : "income",
        resolved.categoryId,
      );
      ruleUpdated = true;
    } catch {
      ruleUpdated = false; // best-effort: la categoría ya se movió.
    }
  }

  return { status: "ok", categoryName: resolved.categoryName, merchant: last.merchant, ruleUpdated };
}
