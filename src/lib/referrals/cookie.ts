/**
 * La cookie de atribución. Puro: nombre, TTL y cómo se arma la opción.
 *
 * ── POR QUÉ UNA COOKIE Y NO MEMORIA NI localStorage ─────────────────────────
 * Entre que el usuario aterriza en `/signup?ref=CODE` y que la cuenta existe
 * hay un viaje de ida y vuelta a Google (o al enlace de confirmación del
 * correo). Ese viaje es donde este tipo de atribución se pierde siempre:
 *
 *  · En memoria (estado de React) muere en la primera navegación.
 *  · `localStorage` sobrevive al roundtrip, pero NO existe del lado del
 *    servidor: `/auth/callback` es un route handler, no tiene DOM, y es
 *    justamente ahí donde hay que resolver el código.
 *
 * Una cookie viaja sola en el redirect de vuelta y el servidor la lee sin
 * JavaScript de por medio.
 *
 * `sameSite: "lax"` es deliberado y es el punto fino: con `strict` la cookie NO
 * se manda en la navegación que viene desde accounts.google.com, y toda
 * atribución vía Google se perdería en silencio. `lax` sí la manda en
 * navegaciones GET de nivel superior, que es exactamente la vuelta del OAuth.
 *
 * No es `httpOnly`: la app móvil puede necesitar leerla, y el contenido —un
 * código público por diseño— no es un secreto.
 */

export const REFERRAL_COOKIE = "ca_ref";

/** 30 días: cubre a quien escanea el QR hoy y se registra la semana que viene. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type ReferralCookieOptions = {
  maxAge: number;
  path: string;
  sameSite: "lax";
  secure: boolean;
  httpOnly: false;
};

/** Opciones de la cookie. `secure` solo fuera de desarrollo (localhost es http). */
export function referralCookieOptions(isProduction: boolean): ReferralCookieOptions {
  return {
    maxAge: REFERRAL_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
    httpOnly: false,
  };
}
