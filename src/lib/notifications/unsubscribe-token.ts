import "server-only";

/**
 * Token de baja stateless (sin tabla): `payload.sig` donde payload = base64url
 * de {uid, ch} y sig = HMAC-SHA256(payload) con UNSUBSCRIBE_SECRET. No lleva PII
 * (solo userId opaco + canal). Las funciones son PURAS (reciben `secret`) para
 * testearse sin entorno; la ruta inyecta el secret desde getServerEnv().
 */
import crypto from "node:crypto";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/lib/notifications/preferences";

export type UnsubscribePayload = { userId: string; channel: NotificationChannel };

const b64url = (buf: Buffer): string => buf.toString("base64url");

function hmac(payload: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(payload).digest();
}

/** Firma {userId, channel} → token `payload.sig`. */
export function signUnsubscribeToken(
  userId: string,
  channel: NotificationChannel,
  secret: string,
): string {
  const payload = b64url(Buffer.from(JSON.stringify({ uid: userId, ch: channel })));
  const sig = b64url(hmac(payload, secret));
  return `${payload}.${sig}`;
}

/**
 * Verifica firma (timing-safe) y forma. Devuelve {userId, channel} o null si el
 * token es inválido/manipulado/de canal desconocido. Nunca lanza.
 */
export function verifyUnsubscribeToken(token: string, secret: string): UnsubscribePayload | null {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts as [string, string];

  const expected = b64url(hmac(payload, secret));
  // Comparación de longitud antes de timingSafeEqual (que exige iguales tamaños).
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object") return null;
    const { uid, ch } = decoded as { uid?: unknown; ch?: unknown };
    if (typeof uid !== "string" || uid.length === 0) return null;
    if (typeof ch !== "string" || !(NOTIFICATION_CHANNELS as readonly string[]).includes(ch)) {
      return null;
    }
    return { userId: uid, channel: ch as NotificationChannel };
  } catch {
    return null;
  }
}
