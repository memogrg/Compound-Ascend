import "server-only";

import { cookies } from "next/headers";

import { getUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isValidReferralCode, normalizeReferralCode } from "@/lib/referrals/code";
import { REFERRAL_COOKIE } from "@/lib/referrals/cookie";

/**
 * Atribución de referidos y lectura del propio código/contador.
 *
 * ── EL ALTA NUNCA FALLA POR ESTO ────────────────────────────────────────────
 * Todo lo de este archivo es best-effort y no lanza jamás hacia afuera. Un
 * código inexistente, la base caída o un auto-referido son casos NORMALES, no
 * errores: se ignoran en silencio y el usuario termina de registrarse igual.
 * Perder una atribución es un problema de negocio menor; romper un alta por un
 * parámetro de marketing es imperdonable.
 */

/** Resultado de un intento de atribución. Solo para logs y tests. */
export type AttributionResult =
  "atribuido" | "sin_codigo" | "codigo_invalido" | "auto_referido" | "ya_referido" | "error";

/**
 * Convierte la cookie de referido en una fila de `referrals`, si corresponde.
 *
 * Se llama después de que la cuenta existe (callback de OAuth y de confirmación
 * por correo, más la pantalla de bienvenida como red). Es IDEMPOTENTE por dos
 * vías independientes: comprueba antes de insertar, y el UNIQUE de
 * `referred_user_id` corta cualquier carrera entre esas llamadas.
 *
 * Escribe con SERVICE-ROLE a propósito: `referrals` no tiene política de INSERT,
 * porque si el usuario pudiera escribir ahí se inventaría referidos.
 */
export async function attributeReferralFromCookie(): Promise<AttributionResult> {
  try {
    const jar = await cookies();
    const raw = jar.get(REFERRAL_COOKIE)?.value;
    if (!raw) return "sin_codigo";

    const code = normalizeReferralCode(raw);
    // Forma inválida: ni siquiera se consulta. Descarta basura y `?ref=` con
    // intentos de inyección sin gastar una query.
    if (!isValidReferralCode(code)) return "codigo_invalido";

    const user = await getUser();
    if (!user) return "sin_codigo";

    const db = createServiceRoleClient();

    // ¿Ya tiene referrer? No se sobreescribe: el primero que lo trajo se lo
    // queda. Reescribirlo dejaría que un segundo link "robe" el referido.
    const { data: existing } = await db
      .from("referrals")
      .select("id")
      .eq("referred_user_id", user.id)
      .maybeSingle();
    if (existing) return "ya_referido";

    // El código se resuelve por RPC SECURITY DEFINER: quien se registra no
    // puede leer el perfil de quien lo invitó, y así solo obtiene el id.
    const { data: referrerId, error: rpcError } = await db.rpc("resolve_referral_code", {
      p_code: code,
    });
    if (rpcError) throw rpcError;
    // Código inexistente: silencio. El usuario no tiene por qué enterarse de
    // que el link que le pasaron estaba mal.
    if (!referrerId) return "codigo_invalido";

    // Auto-referido: bloqueado acá y también por CHECK en la tabla.
    if (referrerId === user.id) return "auto_referido";

    const { error } = await db.from("referrals").insert({
      referrer_user_id: referrerId,
      referred_user_id: user.id,
    });
    if (error) {
      // 23505 = unique_violation: otra llamada ganó la carrera. Es el resultado
      // esperado del diseño idempotente, no un fallo.
      if (error.code === "23505") return "ya_referido";
      throw error;
    }

    return "atribuido";
  } catch (err) {
    logger.warn("atribución de referido fallida", {
      message: err instanceof Error ? err.message : "?",
    });
    return "error";
  }
}

export type MyReferral = {
  code: string;
  count: number;
};

/**
 * Código y contador del usuario actual. El contador sale de `count(*)` sobre
 * `referrals` —la fila es el hecho— y no de un acumulador en `profiles`, que se
 * desincronizaría sin forma de auditarlo.
 */
export async function getMyReferral(): Promise<MyReferral | null> {
  const user = await getUser();
  if (!user) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from("profiles").select("referral_code").eq("id", user.id).maybeSingle(),
      // RLS ya acota a los propios (`referrals_select_own`); el filtro explícito
      // deja la intención escrita y no cuesta nada.
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_user_id", user.id),
    ]);
    const code = profile?.referral_code;
    if (!code) return null;
    return { code, count: count ?? 0 };
  } catch (err) {
    logger.warn("lectura de referidos fallida", {
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}
