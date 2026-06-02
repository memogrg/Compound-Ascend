/**
 * Política CORS por ambiente. Sin wildcard en producción.
 * Devuelve las cabeceras CORS solo si el Origin está en la allowlist.
 */
import { getServerEnv } from "@/lib/env";

function allowedOrigins(): string[] {
  return getServerEnv()
    .ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

/** Cabeceras CORS para un Origin concreto (vacío si no está permitido). */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!isAllowedOrigin(origin) || !origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

/**
 * Verifica que una petición que muta estado provenga de un origen confiable.
 * Útil en endpoints sensibles (IA, scanner, webhooks) contra CSRF/impersonación.
 */
export function assertTrustedOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return isAllowedOrigin(origin);
  // Sin Origin: aceptamos peticiones same-site verificando Referer/host.
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return isAllowedOrigin(new URL(referer).origin);
  } catch {
    return false;
  }
}
