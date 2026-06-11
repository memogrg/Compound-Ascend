import "server-only";

/**
 * household_id activo del usuario para etiquetar inserciones, de modo que el
 * resto del hogar también vea los datos (las RLS permiten ver filas del hogar).
 * Devuelve el hogar donde es owner si existe; si no, el primer hogar activo;
 * null si no pertenece a ningún hogar (modo solo: solo el usuario ve sus datos).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getActiveHouseholdId(
  supabase: ServerClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return null;
  const owned = data.find((m) => m.role === "owner");
  return (owned ?? data[0])?.household_id ?? null;
}
