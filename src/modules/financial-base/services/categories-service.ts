import "server-only";

/**
 * Servicio de categorías (sistema + propias + del hogar) para el módulo de
 * Transacciones.
 *
 * Modelo: árbol jerárquico en `expense_categories` (parent_id). El sistema trae
 * 8 grupos de Nivel 1 (key `g_*`) y categorías legadas re-parentadas como Nivel 2.
 * La UI presenta 2 niveles visibles: Grupo → (sub)categoría seleccionable.
 *
 * RLS permite ver las categorías de sistema (user_id null), las propias y las del
 * hogar. Personalización por hogar (Fase 1): `listCategories()`/`listCategoryTree()`
 * RESUELVEN los `category_overrides` del hogar activo (ocultar/forkear), mientras
 * que `getCategoryNameMap()` se queda AMPLIO para etiquetar históricos (incluidas
 * bases ocultas). `getSystemCategoryId` (is_system=true) sigue intacto.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId, isActiveHouseholdEditor, householdWriteScope } from "@/lib/household/active";
import { logHouseholdDeletion } from "@/lib/household/activity-log";
import {
  resolveCategoryOverrides,
  type OverrideLite,
} from "@/modules/financial-base/engine/category-overrides";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExpenseCategoryRow } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

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

/** Fetch AMPLIO (sistema + propias + hogar) sin resolver overrides. */
async function fetchRawCategories(supabase: Client): Promise<Category[]> {
  const { data } = await supabase
    .from("expense_categories")
    .select(SELECT_COLS)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return ((data ?? []) as CategoryRowLite[]).map(rowToCategory);
}

/**
 * Overrides de un scope EXPLÍCITO (hogar si lo hay, si no el usuario en modo solo).
 * Reutilizable por sesión (RLS) y por caminos service-role (WhatsApp/ingesta), que
 * ya conocen su scope. Vacío → la resolución es identidad.
 */
export async function getScopeOverrides(
  supabase: Client,
  scope: { userId: string; householdId: string | null },
): Promise<OverrideLite[]> {
  const base = supabase.from("category_overrides").select("category_id, hidden, fork_id");
  const scoped = scope.householdId
    ? base.eq("household_id", scope.householdId)
    : base.eq("user_id", scope.userId).is("household_id", null);
  const { data } = await scoped;
  return ((data ?? []) as { category_id: string; hidden: boolean; fork_id: string | null }[]).map(
    (r) => ({ categoryId: r.category_id, hidden: r.hidden, forkId: r.fork_id }),
  );
}

/** Overrides del scope ACTIVO del usuario (deriva el hogar). Para la sesión. */
async function loadScopeOverrides(supabase: Client, userId: string): Promise<OverrideLite[]> {
  const householdId = await getActiveHouseholdId(supabase, userId);
  return getScopeOverrides(supabase, { userId, householdId });
}

/**
 * Estado de personalización del hogar activo para la UI (Fase 2): qué categorías
 * BASE están ocultas sin fork (para ofrecer "Mostrar") y el mapeo fork→base (para
 * ofrecer "Revertir" desde la copia visible y marcarla como personalizada). Amplio
 * en nombres (usa `listRawCategories`, que incluye bases ocultas). Vacío → sin
 * personalización (la UI no muestra estados especiales).
 */
export type CategoryPersonalization = {
  /** Bases ocultas sin fork: no tienen fila visible → se listan para "Mostrar". */
  hidden: { id: string; name: string }[];
  /** forkId → baseId de la base que reemplaza (para "Revertir" y badge "editado"). */
  forkToBase: Record<string, string>;
};

/** ¿El usuario actual puede personalizar categorías del hogar? (editor owner/adult). */
export async function canPersonalizeCategories(): Promise<boolean> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  return isActiveHouseholdEditor(supabase, user.id);
}

export async function getCategoryPersonalization(): Promise<CategoryPersonalization> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const overrides = await loadScopeOverrides(supabase, user.id);
  if (overrides.length === 0) return { hidden: [], forkToBase: {} };

  const nameOf = new Map((await fetchRawCategories(supabase)).map((c) => [c.id, c.name]));
  const hidden: { id: string; name: string }[] = [];
  const forkToBase: Record<string, string> = {};
  for (const o of overrides) {
    if (o.forkId) forkToBase[o.forkId] = o.categoryId;
    else if (o.hidden) hidden.push({ id: o.categoryId, name: nameOf.get(o.categoryId) ?? "Categoría" });
  }
  return { hidden, forkToBase };
}

/**
 * Lista plana AMPLIA de TODAS las categorías visibles (sistema + propias + hogar),
 * SIN resolver overrides. Para etiquetar agregados/históricos (incluye inactivas y
 * bases ocultas), donde ocultar rompería la resolución de nombres pasados.
 */
export async function listRawCategories(): Promise<Category[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  return fetchRawCategories(supabase);
}

/**
 * Lista plana RESUELTA (sistema + propias + hogar) con los overrides del hogar
 * aplicados: bases ocultas quitadas, forks reemplazando al original (adoptando su
 * subárbol), huérfanos descartados. IDENTIDAD cuando el hogar no tiene overrides.
 */
export async function listCategories(): Promise<Category[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [raw, overrides] = await Promise.all([
    fetchRawCategories(supabase),
    loadScopeOverrides(supabase, user.id),
  ]);
  return resolveCategoryOverrides(raw, overrides);
}

/**
 * Mapa id → nombre AMPLIO (incluye inactivas, fusionadas y bases ocultas) para
 * etiquetar agregados históricos por categoría. NO resuelve overrides a propósito.
 */
export async function getCategoryNameMap(): Promise<Record<string, string>> {
  const cats = await listRawCategories();
  const map: Record<string, string> = {};
  for (const c of cats) map[c.id] = c.name;
  return map;
}

/**
 * Árbol de Nivel 1 → descendientes seleccionables (aplanados, activos), para el
 * selector premium. `type` filtra por naturaleza de la categoría; 'expense' es
 * el caso por defecto del registro de gastos. Parte de la lista RESUELTA.
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

/** Ruta legible "Grupo › Sub" para tooltips/etiquetas. Sobre la lista AMPLIA. */
export async function getCategoryPath(id: string): Promise<string> {
  const all = await listRawCategories();
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

/**
 * Resuelve una categoría BASE a su destino EFECTIVO en el scope activo:
 *   - si está forkeada → la copia (`fork_id`),
 *   - si está oculta sin fork → null (no debe usarse: ya no es visible),
 *   - si no tiene override → la misma id (identidad).
 * Reutilizable por sesión (RLS) y por caminos service-role (WhatsApp/ingesta), que
 * pasan el scope explícito. Best-effort: un fallo de lectura devuelve la id original.
 */
export async function resolveOverrideTarget(
  supabase: Client,
  scope: { userId: string; householdId: string | null },
  categoryId: string,
): Promise<string | null> {
  try {
    const base = supabase
      .from("category_overrides")
      .select("hidden, fork_id")
      .eq("category_id", categoryId);
    const scoped = scope.householdId
      ? base.eq("household_id", scope.householdId)
      : base.eq("user_id", scope.userId).is("household_id", null);
    const { data } = await scoped.maybeSingle();
    if (!data) return categoryId;
    if (data.fork_id) return data.fork_id;
    if (data.hidden) return null;
    return categoryId;
  } catch {
    return categoryId;
  }
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
  /** "Gasto esencial" (número de seguridad). Ortogonal a default_nature. */
  isEssential?: boolean;
  /** Interno (fork): preserva la key del original; no expuesto en el schema Zod. */
  key?: string | null;
  /** Interno (fork): preserva el vínculo a entidad del original. */
  linkedKind?: string | null;
};

export async function createCategory(input: CategoryWriteInput): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // household_id del hogar activo: así el resto del hogar también ve la categoría.
  const householdId = await getActiveHouseholdId(supabase, user.id);
  const { data } = await supabase
    .from("expense_categories")
    .insert({
      user_id: user.id,
      household_id: householdId,
      parent_id: input.parentId ?? null,
      key: input.key ?? null,
      name: input.name,
      category_type: input.categoryType ?? "expense",
      icon: input.icon ?? null,
      color: input.color ?? null,
      is_favorite: input.isFavorite ?? false,
      is_essential: input.isEssential ?? false,
      linked_kind: input.linkedKind ?? null,
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
  const scope = await householdWriteScope(supabase, user.id);
  const patch: Partial<ExpenseCategoryRow> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.parentId !== undefined) patch.parent_id = input.parentId;
  if (input.categoryType !== undefined) patch.category_type = input.categoryType;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.color !== undefined) patch.color = input.color;
  if (input.isFavorite !== undefined) patch.is_favorite = input.isFavorite;
  if (input.isEssential !== undefined) patch.is_essential = input.isEssential;
  if (Object.keys(patch).length === 0) return;
  // RLS impide editar las de sistema (user_id distinto); el filtro lo refuerza.
  await supabase.from("expense_categories").update(patch).eq("id", id).in("user_id", scope);
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
  const scope = await householdWriteScope(supabase, user.id);
  const householdId = await getActiveHouseholdId(supabase, user.id);
  if (reassignToId) {
    await reassignReferences(supabase, id, reassignToId, user.id, householdId);
  }
  await supabase.from("expense_categories").delete().eq("id", id).in("user_id", scope);
  await logHouseholdDeletion(supabase, { userId: user.id, table: "expense_categories", rowId: id, householdId });
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
  const scope = await householdWriteScope(supabase, user.id);
  const householdId = await getActiveHouseholdId(supabase, user.id);
  await reassignReferences(supabase, fromId, intoId, user.id, householdId);
  await supabase
    .from("expense_categories")
    .update({ last_edited_by: user.id, merged_into_id: intoId, is_active: false })
    .eq("id", fromId)
    .in("user_id", scope);
  await supabase.from("expense_categories").delete().eq("id", fromId).in("user_id", scope);
  await logHouseholdDeletion(supabase, {
    userId: user.id,
    table: "expense_categories",
    rowId: fromId,
    householdId,
  });
}

// ============================================================
// Personalización por hogar (Fase 1): ocultar / forkear frascos y sobres
// ============================================================

/** Solo un EDITOR (owner/adult) del hogar puede personalizar; un viewer no. */
async function assertEditor(supabase: Client, userId: string): Promise<void> {
  if (!(await isActiveHouseholdEditor(supabase, userId))) {
    throw new Error("Solo un editor del hogar puede personalizar las categorías.");
  }
}

/** Inserta o actualiza el override del scope para una categoría base. */
async function upsertOverride(
  supabase: Client,
  args: {
    userId: string;
    householdId: string | null;
    categoryId: string;
    hidden: boolean;
    forkId: string | null;
  },
): Promise<void> {
  const { userId, householdId, categoryId, hidden, forkId } = args;
  const base = supabase.from("category_overrides").select("id").eq("category_id", categoryId);
  const scoped = householdId
    ? base.eq("household_id", householdId)
    : base.eq("user_id", userId).is("household_id", null);
  const { data: existing } = await scoped.maybeSingle();
  if (existing?.id) {
    await supabase
      .from("category_overrides")
      .update({ hidden, fork_id: forkId })
      .eq("id", existing.id);
  } else {
    await supabase.from("category_overrides").insert({
      user_id: userId,
      household_id: householdId,
      category_id: categoryId,
      hidden,
      fork_id: forkId,
    });
  }
}

/** Ids de todos los descendientes visibles de `baseId` (BFS sobre el árbol amplio). */
async function visibleDescendantIds(supabase: Client, baseId: string): Promise<string[]> {
  const raw = await fetchRawCategories(supabase);
  const childrenOf = new Map<string, string[]>();
  for (const c of raw) {
    if (!c.parentId) continue;
    const list = childrenOf.get(c.parentId);
    if (list) list.push(c.id);
    else childrenOf.set(c.parentId, [c.id]);
  }
  const out: string[] = [];
  const seen = new Set<string>([baseId]);
  const stack = [baseId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const ch of childrenOf.get(cur) ?? []) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      out.push(ch);
      stack.push(ch);
    }
  }
  return out;
}

/**
 * OCULTA una categoría base para el hogar (override hidden) y, opcionalmente,
 * reasigna sus movimientos (y los de sus sobres descendientes, si es un frasco) a
 * `reassignToId`. No muta el árbol de categorías: la resolución descarta la base
 * (y sus huérfanos) en memoria. Gateado a editores del hogar.
 */
export async function hideCategory(baseId: string, reassignToId?: string | null): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await assertEditor(supabase, user.id);
  const householdId = await getActiveHouseholdId(supabase, user.id);

  if (reassignToId) {
    await reassignMovements(supabase, baseId, reassignToId, user.id, householdId);
    // Frasco: sus sobres quedarían huérfanos al ocultarlo sin fork → mueve también
    // sus movimientos al destino para no perder histórico.
    for (const descId of await visibleDescendantIds(supabase, baseId)) {
      await reassignMovements(supabase, descId, reassignToId, user.id, householdId);
    }
  }

  await upsertOverride(supabase, {
    userId: user.id,
    householdId,
    categoryId: baseId,
    hidden: true,
    forkId: null,
  });
}

/**
 * FORKEA una categoría base: crea una copia del hogar preservando
 * key/parent_id/linked_kind/category_type y aplicando el `patch`
 * (name/icon/color/is_favorite), registra el override {hidden, fork_id} y reasigna
 * los movimientos de la base a la copia. Los hijos de la base se adoptan al fork en
 * la resolución (por parent_id). Gateado a editores del hogar. Devuelve el id de la copia.
 */
export async function forkCategory(
  baseId: string,
  patch: { name?: string; icon?: string | null; color?: string | null; isFavorite?: boolean },
): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await assertEditor(supabase, user.id);

  const { data: base } = await supabase
    .from("expense_categories")
    .select("key,parent_id,linked_kind,category_type,name,icon,color,is_favorite")
    .eq("id", baseId)
    .maybeSingle();
  if (!base) throw new Error("La categoría base no existe.");

  const forkId = await createCategory({
    name: patch.name ?? base.name,
    parentId: base.parent_id,
    categoryType: (base.category_type ?? "expense") as CategoryWriteInput["categoryType"],
    icon: patch.icon !== undefined ? patch.icon : base.icon,
    color: patch.color !== undefined ? patch.color : base.color,
    isFavorite: patch.isFavorite !== undefined ? patch.isFavorite : Boolean(base.is_favorite),
    key: base.key,
    linkedKind: base.linked_kind,
  });
  if (!forkId) throw new Error("No pudimos crear la copia de la categoría.");

  const householdId = await getActiveHouseholdId(supabase, user.id);
  await upsertOverride(supabase, {
    userId: user.id,
    householdId,
    categoryId: baseId,
    hidden: true,
    forkId,
  });
  await reassignMovements(supabase, baseId, forkId, user.id, householdId);
  return forkId;
}

/**
 * Revierte la personalización de una base: borra el override del scope y, si había
 * fork, devuelve los movimientos de la copia a la base y borra la copia. Gateado a
 * editores. `unhideCategory`/`unforkCategory` comparten esta lógica (una re-muestra
 * un ocultamiento simple; la otra deshace un fork con copia).
 */
async function revertOverride(baseId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await assertEditor(supabase, user.id);
  const householdId = await getActiveHouseholdId(supabase, user.id);

  const base = supabase
    .from("category_overrides")
    .select("id, fork_id")
    .eq("category_id", baseId);
  const scoped = householdId
    ? base.eq("household_id", householdId)
    : base.eq("user_id", user.id).is("household_id", null);
  const { data: ov } = await scoped.maybeSingle();
  if (!ov) return;

  if (ov.fork_id) {
    await reassignMovements(supabase, ov.fork_id, baseId, user.id, householdId);
    await supabase.from("expense_categories").delete().eq("id", ov.fork_id);
    // Deshacer un fork elimina una categoría VISIBLE del hogar → se registra.
    // (Unhide, en cambio, solo quita el override y la categoría base REAPARECE:
    // no se borra nada, por eso no se loguea la baja del override en sí.)
    await logHouseholdDeletion(supabase, {
      userId: user.id,
      table: "expense_categories",
      rowId: ov.fork_id,
      householdId,
    });
  }
  await supabase.from("category_overrides").delete().eq("id", ov.id);
}

/** Re-muestra una categoría base oculta para el hogar (revierte el override). */
export async function unhideCategory(baseId: string): Promise<void> {
  return revertOverride(baseId);
}

/** Deshace el fork de una categoría base: borra la copia y el override. */
export async function unforkCategory(baseId: string): Promise<void> {
  return revertOverride(baseId);
}

// ============================================================
// Reasignación de referencias (household-scoped)
// ============================================================

/**
 * Mueve los MOVIMIENTOS (transactions, budget_items, expense_items) de `fromId` a
 * `intoId`. Cuando hay hogar activo, filtra por `household_id` para mover también
 * los de OTROS miembros del hogar (categorías compartidas); en modo solo, por
 * `user_id`. No toca el árbol de categorías.
 */
async function reassignMovements(
  supabase: Client,
  fromId: string,
  intoId: string,
  userId: string,
  householdId: string | null,
): Promise<void> {
  const txns = supabase.from("transactions").update({ category_id: intoId }).eq("category_id", fromId);
  const budget = supabase.from("budget_items").update({ category_id: intoId }).eq("category_id", fromId);
  const items = supabase.from("expense_items").update({ category_id: intoId }).eq("category_id", fromId);
  await Promise.all([
    householdId ? txns.eq("household_id", householdId) : txns.eq("user_id", userId),
    householdId ? budget.eq("household_id", householdId) : budget.eq("user_id", userId),
    householdId ? items.eq("household_id", householdId) : items.eq("user_id", userId),
  ]);
}

/**
 * Re-apunta movimientos (vía `reassignMovements`) y, además, sube las categorías
 * HIJAS al destino (para delete/merge, que sí mutan el árbol). Household-scoped.
 */
async function reassignReferences(
  supabase: Client,
  fromId: string,
  intoId: string,
  userId: string,
  householdId: string | null,
): Promise<void> {
  await reassignMovements(supabase, fromId, intoId, userId, householdId);
  const children = supabase
    .from("expense_categories")
    .update({ parent_id: intoId })
    .eq("parent_id", fromId);
  await (householdId ? children.eq("household_id", householdId) : children.eq("user_id", userId));
}
