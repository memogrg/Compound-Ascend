import "server-only";

/**
 * Re-clasificar un movimiento desde WhatsApp (comando "mover [el de <monto>] a <sobre>"):
 * la última transacción o la más reciente con un monto dado. SERVICE ROLE (omite RLS): el
 * webhook no tiene sesión. Resuelve el sobre por nombre entre las categorías HOJA activas
 * visibles (propias + sistema) de la naturaleza correcta, y opcionalmente actualiza/crea la
 * regla del comercio (upsert).
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { upsertRuleForUser } from "@/modules/financial-base/services/rules-service";
import { categoryMatchesKind } from "@/modules/financial-base/engine/classify";
import { normalize } from "@/lib/ai/biblia-knowledge";

// "mover/cambiar/recategorizar …" → re-clasifica una transacción (la última o por monto).
const MOVE_RE = /^(?:mover|cambiar|recategoriza(?:r)?)\s+(.+)$/i;
// Palabras que, dentro del comando, piden además actualizar/crear la regla del comercio.
const ALWAYS_RE = /\b(siempre|a\s+futuro(?:s)?|para\s+siempre|de\s+ahora\s+en\s+adelante)\b/gi;
// Selector de monto al INICIO: "[el|la|…] [gasto|movimiento|…] de <número>".
// Anclado en ^ para no confundirse con un sobre que contenga "de" (p. ej. "Cuentas de casa").
const AMOUNT_SELECTOR_RE =
  /^(?:el|la|lo|ese|esa|aquel|aquella)?\s*(?:gasto|ingreso|movimiento|compra|pago|cargo|monto|transacci[oó]n)?\s*de\s+(\d[\d.,]*)\s*/i;

/** Convierte "12.000" / "12,000" / "12000" a 12000. Asume montos enteros (colones). */
function parseAmount(s: string): number | null {
  const digits = s.replace(/[.,\s]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parsea "mover [el de <monto>] a <sobre> [siempre]". Devuelve el sobre limpio, si pidió
 * tocar la regla ("siempre"/"a futuro") y un monto opcional para elegir cuál transacción
 * (null = la última). Null si no es un comando de mover. Puro y testeable.
 */
export function parseMoveCommand(
  body: string,
): { sobre: string; alsoRule: boolean; amount: number | null } | null {
  const m = body.trim().match(MOVE_RE);
  if (!m) return null;
  let rest = m[1]!.trim();

  // 1) "siempre"/"a futuro" → alsoRule (puede ir en cualquier parte).
  const withoutAlways = rest.replace(ALWAYS_RE, " ").trim();
  const alsoRule = withoutAlways.length !== rest.length;
  rest = withoutAlways;

  // 2) Selector de monto al inicio (opcional).
  let amount: number | null = null;
  const am = rest.match(AMOUNT_SELECTOR_RE);
  if (am) {
    amount = parseAmount(am[1]!);
    rest = rest.slice(am[0].length).trim();
  }

  // 3) "a <sobre>".
  const sobre = rest.replace(/^a(?:l)?\s+/i, "").trim();
  return { sobre, alsoRule, amount };
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
  | { status: "no_txn"; amount: number | null }
  | { status: "error" };

function rowToTarget(data: { id: string; merchant_or_source: string | null; kind: string }): LastTransaction {
  return {
    id: data.id,
    merchant: data.merchant_or_source ?? null,
    kind: data.kind === "ingreso" ? "ingreso" : "gasto",
  };
}

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
  return data ? rowToTarget(data) : null;
}

/** Transacción gasto/ingreso más reciente con ese monto exacto (para "el de 12000"). */
export async function getTransactionByAmount(
  userId: string,
  amount: number,
): Promise<LastTransaction | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, merchant_or_source, kind")
    .eq("user_id", userId)
    .in("kind", ["gasto", "ingreso"])
    .eq("amount", amount)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? rowToTarget(data) : null;
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
 * Núcleo: re-clasifica `target` al sobre `name`. Si `alsoRule` y hay comercio, además hace
 * upsert de la regla (igualdad exacta). `amount` solo viaja para explicar el caso sin txn.
 */
async function applyMove(
  userId: string,
  target: LastTransaction | null,
  name: string,
  alsoRule: boolean,
  amount: number | null,
): Promise<MoveResult> {
  if (!target) return { status: "no_txn", amount };

  const resolved = await resolveCategoryByName(userId, name, target.kind);
  if (resolved.status === "ambiguous") return { status: "ambiguous", options: resolved.options };
  if (resolved.status === "none") return { status: "not_found", name: name.trim() };

  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: resolved.categoryId })
    .eq("id", target.id)
    .eq("user_id", userId);
  if (error) return { status: "error" };

  let ruleUpdated = false;
  if (alsoRule && target.merchant) {
    try {
      await upsertRuleForUser(
        userId,
        target.merchant,
        target.kind === "gasto" ? "expense" : "income",
        resolved.categoryId,
      );
      ruleUpdated = true;
    } catch {
      ruleUpdated = false; // best-effort: la categoría ya se movió.
    }
  }

  return { status: "ok", categoryName: resolved.categoryName, merchant: target.merchant, ruleUpdated };
}

/** Re-clasifica la ÚLTIMA transacción al sobre `name`. */
export async function moveLastTransaction(
  userId: string,
  name: string,
  alsoRule: boolean,
): Promise<MoveResult> {
  return applyMove(userId, await getLastTransaction(userId), name, alsoRule, null);
}

/**
 * Re-clasifica una transacción al sobre `name`: la última si `amount` es null, o la más
 * reciente con ese monto exacto. Resultado explicable si no hay txn (con el monto buscado),
 * no resuelve el sobre o es ambiguo.
 */
export async function moveTransaction(
  userId: string,
  amount: number | null,
  name: string,
  alsoRule: boolean,
): Promise<MoveResult> {
  const target =
    amount == null
      ? await getLastTransaction(userId)
      : await getTransactionByAmount(userId, amount);
  return applyMove(userId, target, name, alsoRule, amount);
}
