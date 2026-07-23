import "server-only";

/**
 * Resumen LIGERO de sobres para la IA y el router (no arma el modelo de UI de frascos).
 *
 * "Sobre" abarca DOS tipos, y este servicio los separa explícitamente:
 *  (a) Sobres de GASTO mensual → hojas FAVORITAS (`isFavorite`) dentro de los frascos
 *      NORMALES (no vinculados), con su frasco padre y presupuesto del mes.
 *  (b) Sobres ACUMULABLES (metas) → filas de `savings_goals`, ubicadas en su frasco por
 *      `default_category_id`.
 *
 * Alcance de HOGAR (las metas de la cuenta común son de todos) y moneda de VISUALIZACIÓN
 * (los presupuestos salen de getBudgetTotals, ya convertidos). Reutiliza el árbol de
 * categorías y los totales de presupuesto; no recalcula nada.
 */
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { householdMemberIds } from "@/lib/household/active";
import { listCategoryTree } from "@/modules/financial-base/services/categories-service";
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import { parseMonthParam } from "@/modules/financial-base/engine/period";

/** Frascos VINCULADOS: muestran entidades vivas, no sobres de gasto favoritos. */
const LINKED_GROUP_KEYS = new Set(["g_libertad", "g_deudas", "g_defensa", "g_ahorro_lp"]);

export type ExpenseEnvelope = { name: string; budget: number };
export type ExpenseEnvelopeGroup = { frasco: string; envelopes: ExpenseEnvelope[] };
export type GoalEnvelopeGroup = { frasco: string; names: string[] };

export type EnvelopesSummary = {
  currency: string;
  /** Sobres de gasto mensual (hojas favoritas) agrupados por frasco. */
  expense: ExpenseEnvelopeGroup[];
  /** Sobres acumulables (metas) agrupados por frasco. */
  goals: GoalEnvelopeGroup[];
};

export async function getEnvelopesSummary(): Promise<EnvelopesSummary> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [tree, budget] = await Promise.all([
    listCategoryTree("expense"),
    getBudgetTotals(parseMonthParam(undefined, new Date())),
  ]);

  // (a) Sobres de gasto: hojas favoritas de los frascos NORMALES, con presupuesto del mes.
  const expense: ExpenseEnvelopeGroup[] = [];
  for (const root of tree) {
    if (root.key && LINKED_GROUP_KEYS.has(root.key)) continue;
    const favs = root.children.filter((c) => c.isFavorite);
    if (favs.length === 0) continue;
    expense.push({
      frasco: root.name,
      envelopes: favs.map((c) => ({ name: c.name, budget: budget.expenseByKey[c.id]?.value ?? 0 })),
    });
  }

  // Mapa hoja/raíz → nombre del frasco (raíz), para ubicar cada meta por su categoría.
  const frascoOf = new Map<string, string>();
  for (const root of tree) {
    frascoOf.set(root.id, root.name);
    for (const c of root.children) frascoOf.set(c.id, root.name);
  }

  // (b) Sobres acumulables: savings_goals del hogar, agrupadas por frasco.
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data: rows } = await supabase
    .from("savings_goals")
    .select("name,default_category_id")
    .in("user_id", memberIds);
  const goalsByFrasco = new Map<string, string[]>();
  for (const g of rows ?? []) {
    if (!g.name) continue;
    const frasco = (g.default_category_id && frascoOf.get(g.default_category_id)) || "Sin frasco";
    const arr = goalsByFrasco.get(frasco) ?? [];
    arr.push(g.name);
    goalsByFrasco.set(frasco, arr);
  }
  const goals: GoalEnvelopeGroup[] = [...goalsByFrasco.entries()].map(([frasco, names]) => ({
    frasco,
    names,
  }));

  return { currency: budget.currency, expense, goals };
}

/**
 * Formatea el resumen a Markdown determinista (0 tokens, sin alucinar) para responder
 * "cuáles son mis sobres/metas/frascos". El cliente lo pasa por renderMarkdown → HTML seguro.
 * Agrupado por frasco; sobres de gasto y acumulables por separado.
 */
export function formatEnvelopesReply(s: EnvelopesSummary): string {
  const parts: string[] = [];
  if (s.expense.length > 0) {
    parts.push("**Tus sobres de gasto mensual:**");
    for (const g of s.expense) {
      parts.push(`- **Frasco ${g.frasco}:** ${g.envelopes.map((e) => e.name).join(", ")}`);
    }
  }
  if (s.goals.length > 0) {
    if (parts.length) parts.push("");
    parts.push("**Tus sobres acumulables (metas):**");
    for (const g of s.goals) {
      parts.push(`- **Frasco ${g.frasco}:** ${g.names.join(", ")}`);
    }
  }
  if (parts.length === 0) {
    return "Todavía no tenés sobres de gasto favoritos ni metas registradas.";
  }
  return parts.join("\n");
}
