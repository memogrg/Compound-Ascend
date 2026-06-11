/**
 * Verificación de la firma de webhooks de Twilio (X-Twilio-Signature).
 *
 * Algoritmo de Twilio (distinto al HMAC-SHA256 de otros webhooks):
 *  1. Toma la URL completa del request (incluida la query string).
 *  2. Ordena los parámetros POST alfabéticamente por clave.
 *  3. Concatena a la URL cada par clave+valor (sin separadores), en orden.
 *  4. HMAC-SHA1 con el AUTH_TOKEN como clave; resultado en base64.
 *  5. Compara contra X-Twilio-Signature en tiempo constante.
 *
 * Utilidad pura: el secreto se pasa como argumento (no lee env aquí).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTwilioSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;

  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + (params[key] ?? "");
  }
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
