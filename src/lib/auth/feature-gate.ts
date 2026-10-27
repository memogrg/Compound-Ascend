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
import { cache } from "react";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { can, type Feature, type Plan } from "@/lib/plan";
import { readEffectivePlan } from "@/lib/auth/effective-plan";

/**
 * Plan EFECTIVO del usuario autenticado: el propio o el heredado del hogar, el mayor (ver
 * `@/lib/auth/effective-plan`). Una RPC por request gracias a `cache()`. Si la RPC falla cae a
 * 'ninguno', el default seguro: ante la duda, no se regala acceso.
 */
export const getEffectivePlan = cache(async (): Promise<Plan> => {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  return (await readEffectivePlan(supabase, user.id)) ?? "ninguno";
});

/**
 * Plan que decide ACCESO para el usuario autenticado: el efectivo (ver `getEffectivePlan`).
 * Lo que factura cada uno sigue siendo su `profiles.plan`, que esto no lee.
 */
export async function getUserPlan(): Promise<Plan> {
  return getEffectivePlan();
}

/**
 * Exige que el plan del usuario incluya `feature`. Lanza `AppError("FORBIDDEN")`
 * (403) si no. Llamar al inicio de cada acción/ruta de feature premium.
 */
export async function assertFeature(feature: Feature): Promise<void> {
  const plan = await getUserPlan();
  if (!can(plan, feature)) {
    throw new AppError("FORBIDDEN", "Esta función no está incluida en tu plan.");
  }
}
