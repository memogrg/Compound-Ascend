import "server-only";

/**
 * Suscripciones: el ciclo, el cambio de plan y la regla de orfandad.
 *
 * Las tres reglas del negocio, tal como las definió Memo:
 *
 *  1. SUBIR aplica de una. El usuario paga la diferencia y quiere lo que compró
 *     ya, no el mes que viene.
 *  2. BAJAR aplica al VENCER el mes ya pagado. Pagaste treinta días de Max+:
 *     tenés treinta días de Max+. El pedido queda guardado en `plan_pending` y
 *     recién ahí se aplica.
 *  3. Al bajar de un plan de hogar a uno que no lo es, el titular —que es quien
 *     paga— se queda con su plan nuevo y sus datos, y los demás miembros quedan
 *     HUÉRFANOS: conservan su cuenta, su correo y sus datos propios, salen del
 *     hogar y pasan a `ninguno`. La próxima vez que entren ven el muro de
 *     suscripción con el link de pago.
 *
 * Nada de esto se escribe desde el cliente: el trigger `protect_profile_plan`
 * bloquea `plan` y todas las columnas de facturación para el rol `authenticated`.
 * Todo pasa por acá, con service-role.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { can, isDowngrade, householdMemberLimit, type Plan } from "@/lib/plan";

type Db = ReturnType<typeof createServiceRoleClient>;

function db(): Db {
  return createServiceRoleClient();
}

export type EstadoSuscripcion = {
  plan: Plan;
  planPendiente: Plan | null;
  /** Cuándo entra el plan pendiente. */
  cambiaEl: string | null;
  /** Fin del período ya pagado. */
  finDePeriodo: string | null;
  /** Fin de la prueba, si sigue en prueba. */
  finDePrueba: string | null;
  enPrueba: boolean;
};

/** Lo que la interfaz necesita saber para mostrar el estado de la cuenta. */
export async function getEstadoSuscripcion(userId: string): Promise<EstadoSuscripcion> {
  const { data } = await db()
    .from("profiles")
    .select("plan, plan_pending, plan_effective_at, period_end, trial_ends_at")
    .eq("id", userId)
    .maybeSingle();

  const finDePrueba = (data?.trial_ends_at as string | null) ?? null;
  return {
    plan: ((data?.plan as Plan | undefined) ?? "ninguno") as Plan,
    planPendiente: ((data?.plan_pending as Plan | null) ?? null) as Plan | null,
    cambiaEl: (data?.plan_effective_at as string | null) ?? null,
    finDePeriodo: (data?.period_end as string | null) ?? null,
    finDePrueba,
    enPrueba: finDePrueba != null && new Date(finDePrueba) > new Date(),
  };
}

/**
 * Programa una BAJADA de plan. No cambia nada ahora: guarda la intención y la
 * fecha en que entra, que es el fin del período ya pagado.
 *
 * Si no hay `period_end` (todavía no llegó ningún webhook de Stripe), no se
 * inventa una fecha: se rechaza. Adivinar cuándo vence lo pagado es la clase de
 * error que le quita días de servicio a alguien que pagó.
 */
export async function programarBajada(
  userId: string,
  destino: Plan,
): Promise<{ ok: boolean; cambiaEl?: string; message?: string }> {
  const estado = await getEstadoSuscripcion(userId);
  if (!isDowngrade(estado.plan, destino)) {
    return { ok: false, message: "Ese cambio no es una bajada de plan." };
  }
  const cambiaEl = estado.finDePeriodo ?? estado.finDePrueba;
  if (!cambiaEl) {
    return { ok: false, message: "Todavía no sabemos cuándo vence tu período. Intentá más tarde." };
  }

  const { error } = await db()
    .from("profiles")
    .update({ plan_pending: destino, plan_effective_at: cambiaEl })
    .eq("id", userId);
  if (error) {
    logger.error("programarBajada falló", { message: error.message });
    return { ok: false, message: "No pudimos programar el cambio." };
  }
  return { ok: true, cambiaEl };
}

/** Cancela una bajada programada: el usuario se arrepintió antes de que entre. */
export async function cancelarBajada(userId: string): Promise<{ ok: boolean }> {
  const { error } = await db()
    .from("profiles")
    .update({ plan_pending: null, plan_effective_at: null })
    .eq("id", userId);
  return { ok: !error };
}

/**
 * Aplica un plan YA (subidas, y las bajadas cuando les llega la fecha).
 *
 * Limpia el cambio pendiente y, si el plan nuevo no aguanta el hogar, ejecuta la
 * orfandad. El orden importa: primero se escribe el plan y después se sacan los
 * miembros, para que un fallo a mitad de camino deje al titular con su plan
 * correcto y no un hogar deshecho sin razón.
 */
export async function aplicarPlan(
  userId: string,
  destino: Plan,
  extra: { periodEnd?: string | null; trialEndsAt?: string | null } = {},
): Promise<{ ok: boolean; huerfanos: number }> {
  const anterior = (await getEstadoSuscripcion(userId)).plan;

  const patch: {
    plan: Plan;
    plan_pending: null;
    plan_effective_at: null;
    period_end?: string | null;
    trial_ends_at?: string | null;
  } = { plan: destino, plan_pending: null, plan_effective_at: null };
  if (extra.periodEnd !== undefined) patch.period_end = extra.periodEnd;
  if (extra.trialEndsAt !== undefined) patch.trial_ends_at = extra.trialEndsAt;

  const { error } = await db().from("profiles").update(patch).eq("id", userId);
  if (error) {
    logger.error("aplicarPlan falló", { message: error.message });
    return { ok: false, huerfanos: 0 };
  }

  const huerfanos = await desalojarSiNoCabe(userId, anterior, destino);
  return { ok: true, huerfanos };
}

/**
 * La regla de orfandad.
 *
 * Solo corre cuando el plan nuevo tiene MENOS capacidad de hogar que el viejo, y
 * solo sobre hogares donde este usuario es el titular (`role = 'owner'`): quien
 * paga es quien conserva el hogar.
 *
 * A cada miembro desalojado se le marca `status = 'removed'` —no se borra la
 * fila, para que quede el registro de que estuvo— y se le pone `plan = 'ninguno'`.
 * Sus movimientos NO se tocan: son suyos y siguen en su cuenta.
 */
async function desalojarSiNoCabe(ownerId: string, anterior: Plan, destino: Plan): Promise<number> {
  if (householdMemberLimit(destino) >= householdMemberLimit(anterior)) return 0;
  if (can(destino, "household")) return 0;

  const s = db();
  const { data: propios } = await s
    .from("household_members")
    .select("household_id")
    .eq("user_id", ownerId)
    .eq("role", "owner");
  const hogares = (propios ?? []).map((h) => h.household_id as string);
  if (hogares.length === 0) return 0;

  const { data: otros } = await s
    .from("household_members")
    .select("id, user_id")
    .in("household_id", hogares)
    .neq("user_id", ownerId)
    .in("status", ["active", "invited"]);

  const filas = otros ?? [];
  if (filas.length === 0) return 0;

  const ids = filas.map((f) => f.id as string);
  const usuarios = [...new Set(filas.map((f) => f.user_id as string))];

  const { error: e1 } = await s
    .from("household_members")
    .update({ status: "removed" })
    .in("id", ids);
  if (e1) {
    logger.error("orfandad: no se pudo desalojar", { message: e1.message });
    return 0;
  }

  // Quedan sin suscripción propia: al entrar verán el muro con el link de pago.
  const { error: e2 } = await s.from("profiles").update({ plan: "ninguno" }).in("id", usuarios);
  if (e2) logger.error("orfandad: no se pudo dejar sin plan", { message: e2.message });

  logger.info("orfandad aplicada", { desalojados: usuarios.length, destino });
  return usuarios.length;
}

/**
 * Cron: aplica los cambios de plan que ya vencieron.
 *
 * Tolera fallos por usuario — que una cuenta rompa no puede dejar a las demás
 * pagando un plan que ya no usan.
 */
export async function aplicarCambiosVencidos(): Promise<{ aplicados: number; huerfanos: number }> {
  const ahora = new Date().toISOString();
  const { data } = await db()
    .from("profiles")
    .select("id, plan_pending")
    .not("plan_pending", "is", null)
    .lte("plan_effective_at", ahora);

  let aplicados = 0;
  let huerfanos = 0;
  for (const fila of data ?? []) {
    try {
      const r = await aplicarPlan(fila.id as string, fila.plan_pending as Plan);
      if (r.ok) {
        aplicados += 1;
        huerfanos += r.huerfanos;
      }
    } catch (err) {
      logger.error("cambio de plan vencido falló", {
        message: err instanceof Error ? err.message : "?",
      });
    }
  }
  return { aplicados, huerfanos };
}
