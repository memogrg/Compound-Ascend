/**
 * Cabeceras de seguridad HTTP — defensa en profundidad.
 * Se aplican globalmente desde next.config.ts.
 *
 * Nota: la CSP permite Google Fonts (Instrument Serif) y conexiones a Supabase.
 * Las llamadas a IA / market-data son server-side, por lo que NO se listan en
 * connect-src del cliente. Documentamos riesgos residuales en docs/security.md.
 */

type Header = { key: string; value: string };

const isProd = process.env.APP_ENV === "production";

/**
 * El host al que Sentry manda los errores del navegador, sacado del propio DSN.
 *
 * Se DERIVA en vez de escribirse a mano porque un host pegado acá se
 * desincroniza el día que cambie el proyecto de Sentry, y el síntoma sería
 * exactamente el que estamos arreglando: los reportes se bloquean en silencio
 * —la CSP no rompe la página, solo descarta la petición— y uno se entera
 * cuando necesita un error que nunca llegó.
 *
 * Sin DSN devuelve null y la CSP queda como estaba: Sentry ya es inerte ahí.
 */
function sentryIngestHost(): string | null {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    return new URL(dsn).origin;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // En dev permitimos 'unsafe-eval' para el HMR de Next; en prod no.
  const scriptSrc = isProd ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";

  const connectSrc = [
    "'self'",
    supabaseUrl,
    supabaseUrl.replace("https://", "wss://"), // realtime
    "https://challenges.cloudflare.com", // turnstile
    sentryIngestHost(), // reportes de error del navegador
  ]
    .filter(Boolean)
    .join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connectSrc}`,
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    isProd ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildSecurityHeaders(): Header[] {
  const headers: Header[] = [
    { key: "Content-Security-Policy", value: contentSecurityPolicy() },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(self), microphone=(), geolocation=(), payment=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];

  if (isProd) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }

  return headers;
}
