/**
 * Verificación de firma de webhooks (HMAC-SHA256) en tiempo constante.
 * Evita que terceros falsifiquen eventos (p. ej. cambios de plan).
 * Utilidad pura: el secreto se pasa como argumento (no lee env aquí).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifySignature(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
