import "server-only";

/**
 * Servicio de categorías (sistema + propias) para el módulo de Transacciones.
 *
 * Modelo: árbol jerárquico en `expense_categories` (parent_id). El sistema trae
 * 8 grupos de Nivel 1 (key `g_*`) y categorías legadas re-parentadas como Nivel 2.
 * La UI presenta 2 niveles visibles: Grupo → (sub)categoría seleccionable.
 *
 * RLS permite ver las categorías de sistema (user_id null) y las propias.
 * Retro-compatibilidad: `listCategories()` sigue devolviendo la lista plana con
 * los mismos campos antiguos (ahora enriquecidos con campos opcionales).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { ExpenseCategoryRow } from "@/lib/supabase/database.types";

export type Category = {
  id: string;
  key: string | null;
  name: string;
  defaultNature: string | null;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  isFavorite: boolean;
  isActive: boolean;
  isSystem: boolean;
  categoryType: string; // 'expense' | 'income' | 'transfer' | 'both'
  sortOrder: number;
  /** La categoría sugiere vincular a una entidad ('debt'|'goal'|…) o null. */
  linkedKind: string | null;
};

/** Nodo de Nivel 1 con sus descendientes seleccionables aplanados. */
export type CategoryNode = Category & { children: Category[] };

type CategoryRowLite = Pick<
  ExpenseCategoryRow,
  | "id"
  | "key"
  | "name"
  | "default_nature"
  | "parent_id"
  | "icon"
  | "color"
  | "is_favorite"
  | "is_active"
  | "is_system"
  | "category_type"
  | "sort_order"
  | "linked_kind"
>;

const SELECT_COLS =
  "id,key,name,default_nature,parent_id,icon,color,is_favorite,is_active,is_system,category_type,sort_order,linked_kind";

function rowToCategory(r: CategoryRowLite): Category {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    defaultNature: r.default_nature,
    parentId: r.parent_id,
    icon: r.icon,
    color: r.color,
    isFavorite: Boolean(r.is_favorite),
    isActive: r.is_active ?? true,
    isSystem: Boolean(r.is_system),
    categoryType: r.category_type ?? "expense",
    sortOrder: r.sort_order ?? 0,
    linkedKind: r.linked_kind ?? null,
  };
}

/**
 * Lista plana de TODAS las categorías visibles (sistema + propias), activas e
 * inactivas. Mantiene compatibilidad: etiquetar agregados requiere ver también
 * las inactivas/fusionadas para resolver nombres históricos.
 */
export async function listCategories(): Promise<Category[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("expense_categories")
    .select(SELECT_COLS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return ((data ?? []) as CategoryRowLite[]).map(rowToCategory);
}

/** Mapa id → nombre, para etiquetar agregados por categoría (incluye inactivas). */
export async function getCategoryNameMap(): Promise<Record<string, string>> {
  const cats = await listCategories();
  const map: Record<string, string> = {};
  for (const c of cats) map[c.id] = c.name;
  return map;
}

/**
 * Árbol de Nivel 1 → descendientes seleccionables (aplanados, activos), para el
 * selector premium. `type` filtra por naturaleza de la categoría; 'expense' es
 * el caso por defecto del registro de gastos.
 */
export async function listCategoryTree(
  type: "expense" | "income" = "expense",
): Promise<CategoryNode[]> {
  const all = (await listCategories()).filter(
    (c) => c.isActive && (c.categoryType === type || c.categoryType === "both"),
  );
  const byId = new Map(all.map((c) => [c.id, c]));
  const roots = all.filter((c) => !c.parentId || !byId.has(c.parentId)).sort(sortCats);

  // Descendientes (todos los niveles) de un nodo, aplanados y ordenados.
  // `seen` evita bucles infinitos si existiera un ciclo de parent_id (la BD no
  // lo impide a nivel de FK).
  function descendants(rootId: string): Category[] {
    const out: Category[] = [];
    const seen = new Set<string>([rootId]);
    const stack = all.filter((c) => c.parentId === rootId);
    while (stack.length) {
      const node = stack.shift()!;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      out.push(node);
      for (const ch of all.filter((c) => c.parentId === node.id)) {
        if (!seen.has(ch.id)) stack.push(ch);
      }
    }
    return out.sort(sortCats);
  }

  return roots.map((root) => ({ ...root, children: descendants(root.id) }));
}

function sortCats(a: Category, b: Category): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, "es");
}

/** Ruta legible "Grupo › Sub" para tooltips/etiquetas. */
export async function getCategoryPath(id: string): Promise<string> {
  const all = await listCategories();
  const byId = new Map(all.map((c) => [c.id, c]));
  const parts: string[] = [];
  let cur = byId.get(id);
  let guard = 0;
  while (cur && guard < 8) {
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    guard += 1;
  }
  return parts.join(" › ");
}

// ============================================================
// CRUD de categorías personalizadas (solo filas del usuario)
// ============================================================

export type CategoryWriteInput = {
  name: string;
  parentId?: string | null;
  categoryType?: "expense" | "income" | "transfer" | "both";
  icon?: string | null;
  color?: string | null;
  isFavorite?: boolean;
};

export async function createCategory(input: CategoryWriteInput): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("expense_categories")
    .insert({
      user_id: user.id,
      parent_id: input.parentId ?? null,
      name: input.name,
      category_type: input.categoryType ?? "expense",
      icon: input.icon ?? null,
      color: input.color ?? null,
      is_favorite: input.isFavorite ?? false,
      is_system: false,
      is_active: true,
    })
    .select("id")
    .maybeSingle();
  return data?.id ?? null;
}

/** Edita una categoría. Las de sistema solo permiten alternar `is_favorite`. */
export async function updateCategory(
  id: string,
  input: Partial<CategoryWriteInput>,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const patch: Partial<ExpenseCategoryRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.parentId !== undefined) patch.parent_id = input.parentId;
  if (input.categoryType !== undefined) patch.category_type = input.categoryType;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.color !== undefined) patch.color = input.color;
  if (input.isFavorite !== undefined) patch.is_favorite = input.isFavorite;
  if (Object.keys(patch).length === 0) return;
  // RLS impide editar las de sistema (user_id distinto); el filtro lo refuerza.
  await supabase.from("expense_categories").update(patch).eq("id", id).eq("user_id", user.id);
}

/**
 * Elimina una categoría del usuario, re-asignando sus transacciones (y, si las
 * hay, sus hijas) a `reassignToId` para no perder histórico. Si no se indica
 * destino, las transacciones quedan sin categoría (category_id null por la FK
 * ON DELETE SET NULL) pero NUNCA se borran.
 */
export async function deleteCategory(id: string, reassignToId?: string | null): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  if (reassignToId) {
    await reassignReferences(id, reassignToId, user.id);
  }
  await supabase.from("expense_categories").delete().eq("id", id).eq("user_id", user.id);
}

/**
 * Fusiona `fromId` dentro de `intoId`: re-asigna todas las referencias y deja
 * trazabilidad (merged_into_id). Si `fromId` es del usuario, además la desactiva
 * y la borra; si es de sistema (no se puede borrar por RLS), solo la desactiva.
 */
export async function mergeCategory(fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) return;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await reassignReferences(fromId, intoId, user.id);
  await supabase
    .from("expense_categories")
    .update({ merged_into_id: intoId, is_active: false })
    .eq("id", fromId)
    .eq("user_id", user.id);
  await supabase.from("expense_categories").delete().eq("id", fromId).eq("user_id", user.id);
}

/** Re-apunta transactions, expense_items, budget_items y categorías hijas. */
async function reassignReferences(fromId: string, intoId: string, userId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await Promise.all([
    supabase
      .from("transactions")
      .update({ category_id: intoId })
      .eq("category_id", fromId)
      .eq("user_id", userId),
    supabase
      .from("budget_items")
      .update({ category_id: intoId })
      .eq("category_id", fromId)
      .eq("user_id", userId),
    supabase
      .from("expense_items")
      .update({ category_id: intoId })
      .eq("category_id", fromId)
      .eq("user_id", userId),
    // Hijas del usuario suben de nivel hacia el destino.
    supabase
      .from("expense_categories")
      .update({ parent_id: intoId })
      .eq("parent_id", fromId)
      .eq("user_id", userId),
  ]);
}
