import "server-only";

/**
 * household_id activo del usuario para etiquetar inserciones, de modo que el
 * resto del hogar también vea los datos (las RLS permiten ver filas del hogar).
 * Devuelve el hogar donde es owner si existe; si no, el primer hogar activo;
 * null si no pertenece a ningún hogar (modo solo: solo el usuario ve sus datos).
 */
import { cache } from "react";
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
 * user_id de TODOS los miembros `active` del hogar activo — incluido el propio.
 * En modo solo (sin hogar) devuelve `[userId]`, así el llamador no necesita
 * ramificar: `.in("user_id", ids)` equivale a `.eq("user_id", userId)`.
 *
 * Para LECTURAS DE DISPLAY (listados, totales, frascos). El RLS ya permite ver
 * las filas del hogar, pero la app las cortaba antes con `.eq("user_id")`; por
 * eso un miembro invitado veía todo vacío aunque los datos estuvieran
 * etiquetados al hogar.
 *
 * NO usar en la lectura que precede a una escritura (leer la meta antes de
 * aportarle, el saldo antes de un pago): ahí `user_id` sigue siendo el control
 * de propiedad. La edición compartida es un delta aparte, con is_household_editor.
 */
async function _householdMemberIds(
  supabase: ServerClient,
  userId: string,
): Promise<string[]> {
  const { householdId } = await resolveActiveMembership(supabase, userId);
  if (!householdId) return [userId]; // modo solo
  const { data } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("status", "active");
  const ids = (data ?? []).map((m) => m.user_id);
  // El propio siempre presente: si la consulta falla o la membresía todavía no
  // está, el usuario debe seguir viendo SUS datos (nunca menos que hoy).
  return ids.includes(userId) ? ids : [userId, ...ids];
}

/** Dedup por request (React cache): se llama en casi todas las lecturas. */
export const householdMemberIds = cache(_householdMemberIds);

/**
 * Copy único para el estado intermedio de esta entrega: el hogar YA ve todo,
 * pero cada quien edita solo lo suyo. Sin este mensaje, el miembro invitado se
 * topa con un error genérico ("no encontrado") sobre una fila que está viendo
 * en pantalla — parece un bug, no una regla.
 */
export const HOUSEHOLD_READ_ONLY_MESSAGE =
  "Por ahora solo quien creó este registro puede editarlo; la edición compartida llega pronto.";

/**
 * ¿La fila existe en el HOGAR aunque no sea del usuario? Se usa cuando una
 * lectura-guardia por `user_id` no encontró nada, para distinguir dos casos que
 * hoy se ven iguales: "no existe" vs "es de otro miembro".
 *
 * No cambia el comportamiento (la edición sigue bloqueada), solo el mensaje.
 * Devuelve false ante cualquier error: nunca debe romper la acción original.
 */
export async function existsInHousehold(
  supabase: ServerClient,
  userId: string,
  table: string,
  id: string,
): Promise<boolean> {
  try {
    const ids = await householdMemberIds(supabase, userId);
    if (ids.length <= 1) return false; // modo solo: no hay "otro miembro" posible
    const { data } = await supabase
      // El nombre de tabla es de un literal del propio código, nunca del usuario.
      .from(table as never)
      .select("id")
      .eq("id", id)
      .in("user_id", ids)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
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
