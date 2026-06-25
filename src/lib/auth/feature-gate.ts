import "server-only";

/**
 * Gating de features premium en el SERVIDOR.
 *
 * La UI puede ocultar el acceso a una feature de pago, pero ocultar no es
 * autorizar: la autorización REAL vive aquí. Toda acción/ruta de una feature
 * premium debe empezar llamando `assertFeature(<feature>)` — si el plan del
 * usuario no la incluye, lanza 403 (no se confía en que el cliente la esconda).
 *
 * `can()` (módulo puro en `@/lib/plan`) sigue siendo la fuente de verdad de qué
 * incluye cada plan; este helper lo enchufa al plan real del usuario.
 */
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { can, type Feature, type Plan } from "@/lib/plan";

/** Plan del usuario autenticado (server-side). Default seguro: 'free'. */
export async function getUserPlan(): Promise<Plan> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  return (data?.plan ?? "free") as Plan;
}

/**
 * Exige que el plan del usuario incluya `feature`. Lanza `AppError("FORBIDDEN")`
 * (403) si no. Llamar al inicio de cada acción/ruta de feature premium.
 */
export async function assertFeature(feature: Feature): Promise<void> {
  const plan = await getUserPlan();
  if (!can(plan, feature)) {
    throw new AppError("FORBIDDEN", "Esta función es parte del plan Premium.");
  }
}
