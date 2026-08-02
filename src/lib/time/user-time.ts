import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";

import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import type { Period } from "@/modules/financial-base/types";
import {
  TZ_COOKIE,
  isValidTimeZone,
  currentPeriodInTz,
  todayISOInTz,
  hourInTz,
} from "@/lib/time/user-time-core";

/**
 * Tiempo del USUARIO, no del servidor. En Vercel el server corre en UTC, así que
 * `new Date().getMonth()/getDate()` da el mes/día en UTC: un usuario en Costa Rica
 * (UTC−6) a las 8pm del 31-jul vería agosto. Este módulo resuelve la ZONA del usuario
 * y expone "hoy / mes actual / hora" ya calculados en ella.
 *
 * Orden de resolución: cookie `tz` (rápida, sin BD) → user_settings.timezone → "UTC"
 * (comportamiento anterior; se auto-cura al capturar la zona). El cálculo de calendario
 * es puro y vive en `user-time-core` (probado aparte). El CLIENTE no usa esto: en el
 * navegador `new Date()` ya está en la zona del usuario (ver `todayLocalISO`).
 */

// Re-exporta el núcleo puro para que los consumidores tengan un único punto de entrada.
export {
  TZ_COOKIE,
  isValidTimeZone,
  ymdInTz,
  todayISOInTz,
  currentPeriodInTz,
  captureToday,
  hourInTz,
} from "@/lib/time/user-time-core";

/** Zona guardada del usuario (user_settings.timezone), o null si no hay / es inválida. */
async function _getUserTimezone(ctx?: AuthContext): Promise<string | null> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    const { data } = await db
      .from("user_settings")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    return isValidTimeZone(data?.timezone) ? data.timezone : null;
  } catch {
    // Sin sesión (webhook/cron sin ctx): no hay usuario → sin zona guardada.
    return null;
  }
}
/** Dedup por request (React cache). */
export const getUserTimezone = cache(_getUserTimezone);

/**
 * Zona EFECTIVA si se conoce, o null si todavía no se capturó ninguna.
 * Con `ctx` (cron/service-role) no hay cookie de request → solo perfil.
 * Sin `ctx` (sesión): cookie `tz` (sin BD) → perfil.
 *
 * El null importa: es la diferencia entre "el usuario está en UTC" y "todavía no sabemos
 * dónde está". Los cálculos de servidor asumen UTC (ver `resolveUserTz`), pero el cliente
 * puede hacer algo mejor con el null — preguntarle al dispositivo (ver `captureToday`).
 */
async function _knownUserTz(ctx?: AuthContext): Promise<string | null> {
  if (!ctx) {
    try {
      const store = await cookies();
      const fromCookie = store.get(TZ_COOKIE)?.value;
      if (isValidTimeZone(fromCookie)) return fromCookie;
    } catch {
      // Fuera de un request (tests, jobs sin scope): sin cookie → perfil.
    }
  }
  return await getUserTimezone(ctx);
}
/** Dedup por request (React cache). */
export const knownUserTz = cache(_knownUserTz);

/**
 * Zona horaria efectiva para "hoy / mes actual", con "UTC" como piso (comportamiento
 * anterior; se auto-cura al capturar la zona).
 */
async function _resolveUserTz(ctx?: AuthContext): Promise<string> {
  return (await knownUserTz(ctx)) ?? "UTC";
}
/** Dedup por request (React cache): se resuelve una sola vez aunque lo pidan N servicios. */
export const resolveUserTz = cache(_resolveUserTz);

/** "YYYY-MM-DD" de HOY en la zona del usuario. */
export async function userToday(ctx?: AuthContext): Promise<string> {
  return todayISOInTz(await resolveUserTz(ctx));
}

/** Periodo del MES ACTUAL en la zona del usuario. Reemplaza a `monthPeriod(now.get*…)`. */
export async function userCurrentPeriod(ctx?: AuthContext): Promise<Period> {
  return currentPeriodInTz(await resolveUserTz(ctx));
}

/** Hora (0-23) AHORA en la zona del usuario (para saludos por franja del día). */
export async function userHour(ctx?: AuthContext): Promise<number> {
  return hourInTz(await resolveUserTz(ctx));
}
