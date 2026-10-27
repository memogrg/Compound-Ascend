/**
 * Plan EFECTIVO: el que decide ACCESO (muros, features, presupuesto de IA). Es el mayor entre el
 * plan propio y el del titular de cada hogar donde la persona es miembro activo, si ese titular
 * tiene un plan con hogar. Lo calcula la función SQL `effective_plan` (migración
 * 20261026000001): con su sesión un miembro no puede leer el `profiles.plan` del titular.
 *
 * La FACTURACIÓN no usa esto: lo que paga cada uno sigue siendo su `profiles.plan`.
 *
 * Sin `server-only` a propósito: el middleware también lo usa, con su propio cliente. Con sesión
 * solo se puede pedir el plan propio (la RPC devuelve null para otro id); con service-role,
 * cualquiera.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { PLAN_RANK, type Plan } from "@/lib/plan";

function esPlan(v: unknown): v is Plan {
  return typeof v === "string" && Object.hasOwn(PLAN_RANK, v);
}

/**
 * El plan efectivo de `userId`, o `null` si no se pudo saber (error de la RPC, sin perfil, o
 * consulta de otro id con sesión). Cada llamador decide qué hacer con el null: los muros dejan
 * pasar, el gate de features cae a `ninguno`.
 */
export async function readEffectivePlan(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Plan | null> {
  try {
    const { data, error } = await client.rpc("effective_plan", { p_user: userId });
    if (error) return null;
    return esPlan(data) ? data : null;
  } catch {
    return null;
  }
}
