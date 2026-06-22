import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica X-Hub-Signature-256 de Meta: HMAC-SHA256(rawBody, APP_SECRET).
 * El header llega como "sha256=<hex>". Comparación en tiempo constante.
 */
export function verifyMetaSignature(
  appSecret: string,
  signatureHeader: string | null,
  rawBody: string,
): boolean {
  if (!signatureHeader) return false;
  const [scheme, hex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !hex) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(hex, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
