import "server-only";

/**
 * Borrado de cuenta (#82). Toda la lógica DESTRUCTIVA corre con el cliente
 * service-role (omite RLS: un dueño borra filas de otros autores; el admin API
 * borra el auth user). Orden seguro: Stripe → purge/reassign → limpieza
 * no-cascade → `admin.deleteUser` AL FINAL (si algo falla antes, la cuenta sigue
 * viva).
 *
 * El re-auth (OTP + "BORRAR") y el export .xlsx se resuelven en la capa de
 * acciones ANTES de llamar a `deleteAccountCore`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { AppError } from "@/lib/errors";
import { getStripe } from "@/lib/billing/stripe";

/**
 * Cliente service-role SIN tipar la BD: habilita `.from(<string dinámico>)`, las
 * RPC nuevas (`purge_household`, `reassign_member_rows`, aún no en los tipos
 * generados) y `.update` sobre tablas service-role. Solo backend controlado.
 */
function adminDb(): SupabaseClient {
  return createServiceRoleClient() as unknown as SupabaseClient;
}

export type DeletionRole = "owner" | "member" | "solo";

export type DeletionContext = {
  userId: string;
  role: DeletionRole;
  householdId: string | null;
  /** Solo para role='member': el dueño al que se reasignan las filas. */
  ownerId: string | null;
};

/** Resuelve el rol del que borra (dueño / miembro / solo) y el hogar/dueño. */
export async function resolveDeletionContext(userId: string): Promise<DeletionContext> {
  const db = adminDb();
  const { data: mine, error } = await db
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", undefined, `resolveDeletionContext: ${error.message}`);

  if (!mine?.household_id) return { userId, role: "solo", householdId: null, ownerId: null };

  if (mine.role === "owner") {
    return { userId, role: "owner", householdId: mine.household_id, ownerId: null };
  }

  // Miembro: buscar el dueño del hogar para reasignarle las filas.
  const { data: owner } = await db
    .from("household_members")
    .select("user_id")
    .eq("household_id", mine.household_id)
    .eq("role", "owner")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return {
    userId,
    role: owner?.user_id ? "member" : "solo", // sin dueño vivo → tratar como solo
    householdId: mine.household_id,
    ownerId: owner?.user_id ?? null,
  };
}

/**
 * ¿Es un error de Stripe de "eso ya no existe"? Entonces el trabajo ya está hecho
 * (un reintento del borrado, o una cancelación manual desde el panel de Stripe).
 */
function yaNoExisteEnStripe(err: unknown): boolean {
  const e = err as { code?: unknown; statusCode?: unknown } | null;
  return e?.code === "resource_missing" || e?.statusCode === 404;
}

/**
 * PASO 0 del borrado: cortar la facturación en Stripe.
 *
 * La cancelación es INMEDIATA, no `at_period_end`: la cuenta deja de existir hoy,
 * así que no hay a quién darle el resto del período ni a dónde mandarle el aviso
 * de vencimiento. Cobrarle otro mes a alguien que borró su cuenta es peor que
 * regalarle los días que faltaban.
 *
 * Un fallo de Stripe que NO sea "ya no existe" ABORTA el borrado: es preferible
 * una cuenta viva y un reintento a una cuenta borrada que sigue cobrando, porque
 * después del `deleteUser` ya no queda de dónde sacar los ids para cancelarla.
 *
 * Borrar el cliente elimina sus métodos de pago y sus datos en Stripe. Las
 * facturas y recibos de los pagos YA HECHOS se conservan del lado de Stripe: son
 * registro contable y no nos toca a nosotros borrarlos.
 */
async function cancelarFacturacion(userId: string): Promise<string[]> {
  const hecho: string[] = [];
  const stripe = getStripe();

  const { data } = await adminDb()
    .from("profiles")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  const suscripcion = (data?.stripe_subscription_id as string | null) ?? null;
  const cliente = (data?.stripe_customer_id as string | null) ?? null;

  // Entornos sin cobro (tests, preview) o cuenta que nunca pagó: nada que cancelar.
  if (!stripe || (!suscripcion && !cliente)) return hecho;

  if (suscripcion) {
    try {
      await stripe.subscriptions.cancel(suscripcion);
      hecho.push("stripe_subscription:cancelled");
    } catch (e) {
      if (!yaNoExisteEnStripe(e)) {
        throw new AppError(
          "INTERNAL",
          "No pudimos cancelar tu suscripción. Intentá de nuevo en unos minutos.",
          `subscriptions.cancel(${suscripcion}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      hecho.push("stripe_subscription:inexistente");
    }
  }

  if (cliente) {
    try {
      await stripe.customers.del(cliente);
      hecho.push("stripe_customer:deleted");
    } catch (e) {
      if (!yaNoExisteEnStripe(e)) {
        throw new AppError(
          "INTERNAL",
          "No pudimos cancelar tu suscripción. Intentá de nuevo en unos minutos.",
          `customers.del(${cliente}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      hecho.push("stripe_customer:inexistente");
    }
  }

  return hecho;
}

/** Limpieza EXPLÍCITA de lo que NO cae por cascade de `auth.users`. */
async function explicitCleanup(userId: string): Promise<string[]> {
  const db = adminDb();
  const done: string[] = [];

  // 1) Storage: receipts/<userId>/* (keyed por user_id; sin FK a auth.users).
  try {
    const { data: files } = await db.storage.from("receipts").list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${userId}/${f.name}`);
      await db.storage.from("receipts").remove(paths);
      done.push(`receipts:${paths.length}`);
    }
  } catch (e) {
    // best-effort: un fallo de storage no debe abortar el borrado (se reintenta o queda huérfano acotado)
    console.error("[deleteAccount] storage cleanup falló:", e);
  }

  // 2) referral_counts: user_id sin FK cascade.
  const rc = await db.from("referral_counts").delete().eq("user_id", userId).select("user_id");
  if (rc.data) done.push(`referral_counts:${rc.data.length}`);

  // 3) audit_logs: DELETE de las filas del usuario (D4 — retienen ip/user_agent/diff con PII).
  const al = await db.from("audit_logs").delete().eq("actor_id", userId).select("id");
  if (al.data) done.push(`audit_logs:${al.data.length}`);

  // 4) security_events: ANONIMIZAR (null user_id + metadata; deja el esqueleto para seguridad) (D4).
  const se = await db
    .from("security_events")
    .update({ user_id: null, metadata: null })
    .eq("user_id", userId)
    .select("id");
  if (se.data) done.push(`security_events(anon):${se.data.length}`);

  return done;
}

export type DeletionResult = {
  role: DeletionRole;
  purge?: { op: string; affected: number }[];
  reassign?: { op: string; affected: number }[];
  cleanup: string[];
};

/**
 * Ejecuta el borrado real. Debe llamarse SOLO tras verificar identidad (OTP +
 * "BORRAR") y de haber ofrecido el export. `admin.deleteUser` va al final.
 */
export async function deleteAccountCore(userId: string): Promise<DeletionResult> {
  const db = adminDb();
  const ctx = await resolveDeletionContext(userId);
  const result: DeletionResult = { role: ctx.role, cleanup: [] };

  // 0) Stripe PRIMERO: el cascade del paso 3 borra el perfil con los ids de
  //    facturación, así que después ya no sabríamos qué cancelar. Si Stripe
  //    falla de verdad, esto lanza y la cuenta queda intacta.
  const facturacion = await cancelarFacturacion(userId);

  // 1) Disolver hogar (dueño) o reasignar (miembro) — funciones atómicas.
  if (ctx.role === "owner" && ctx.householdId) {
    const { data, error } = await db.rpc("purge_household", { p_household: ctx.householdId });
    if (error) throw new AppError("INTERNAL", undefined, `purge_household: ${error.message}`);
    result.purge = (data ?? []) as { op: string; affected: number }[];
  } else if (ctx.role === "member" && ctx.ownerId) {
    const { data, error } = await db.rpc("reassign_member_rows", {
      p_member: userId,
      p_owner: ctx.ownerId,
    });
    if (error) throw new AppError("INTERNAL", undefined, `reassign_member_rows: ${error.message}`);
    result.reassign = (data ?? []) as { op: string; affected: number }[];
  }

  // 2) Limpieza explícita (no-cascade).
  result.cleanup = [...facturacion, ...(await explicitCleanup(userId))];

  // 3) IRREVERSIBLE, AL FINAL: borrar el auth user → cascade de ~65 tablas.
  const { error: delErr } = await db.auth.admin.deleteUser(userId);
  if (delErr) throw new AppError("INTERNAL", undefined, `admin.deleteUser: ${delErr.message}`);

  return result;
}
