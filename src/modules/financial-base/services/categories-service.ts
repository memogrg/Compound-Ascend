import "server-only";

/** Lectura de categorías (sistema + propias). RLS permite ver las de sistema y las del usuario. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export type Category = { id: string; key: string | null; name: string; defaultNature: string | null };

export async function listCategories(): Promise<Category[]> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("expense_categories")
    .select("id,key,name,default_nature")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    defaultNature: r.default_nature,
  }));
}

/** Mapa id → nombre, para etiquetar agregados por categoría. */
export async function getCategoryNameMap(): Promise<Record<string, string>> {
  const cats = await listCategories();
  const map: Record<string, string> = {};
  for (const c of cats) map[c.id] = c.name;
  return map;
}
