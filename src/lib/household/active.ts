import "server-only";

/**
 * household_id activo del usuario para etiquetar inserciones, de modo que el
 * resto del hogar también vea los datos (las RLS permiten ver filas del hogar).
 * Devuelve el hogar donde es owner si existe; si no, el primer hogar activo;
 * null si no pertenece a ningún hogar (modo solo: solo el usuario ve sus datos).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// El cliente de servidor (sesión) y el service-role son ambos SupabaseClient<Database>,
// así que este tipo sirve para los dos usos (sesión → RLS, service-role → scoping explícito).
type ServerClient = SupabaseClient<Database>;

/** Membresía activa "elegida": el hogar donde es owner si existe, si no el más antiguo activo. */
async function resolveActiveMembership(
  supabase: ServerClient,
  userId: string,
): Promise<{ householdId: string | null; role: string | null }> {
  const { data } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return { householdId: null, role: null };
  const owned = data.find((m) => m.role === "owner");
  const picked = owned ?? data[0];
  return { householdId: picked?.household_id ?? null, role: picked?.role ?? null };
}

export async function getActiveHouseholdId(
  supabase: ServerClient,
  userId: string,
): Promise<string | null> {
  return (await resolveActiveMembership(supabase, userId)).householdId;
}

/**
 * ¿El usuario es EDITOR (owner/adult) de su hogar activo? Espeja is_household_editor.
 * En modo solo (sin hogar activo) devuelve true: es dueño de sus propios datos.
 * Un viewer/child de un hogar → false (no puede personalizar categorías del hogar).
 */
export async function isActiveHouseholdEditor(
  supabase: ServerClient,
  userId: string,
): Promise<boolean> {
  const { householdId, role } = await resolveActiveMembership(supabase, userId);
  if (!householdId) return true; // modo solo: dueño de sus datos
  return role === "owner" || role === "adult";
}
