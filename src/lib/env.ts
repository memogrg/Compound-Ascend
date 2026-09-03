/**
 * Validación de variables de entorno con Zod.
 *
 * Validación *lazy* y memoizada: se ejecuta en el primer acceso en runtime
 * (fail-fast), no al importar el módulo. Así `next build` no falla cuando los
 * secretos se inyectan en runtime y no en build.
 *
 * - `getClientEnv()`: solo variables NEXT_PUBLIC_* (seguras en el navegador).
 * - `getServerEnv()`: incluye secretos; solo desde código de servidor.
 */
import { z } from "zod";

const appEnvSchema = z.enum(["development", "staging", "production"]);

/** Variable opcional: las cadenas vacías ("") se tratan como ausentes. */
const optionalStr = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().min(1).optional(),
);

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalStr,
});

const serverSchema = z.object({
  APP_ENV: appEnvSchema.default("development"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  SUPABASE_SERVICE_ROLE_KEY: optionalStr,
  AI_PROVIDER: z.enum(["gemini"]).default("gemini"),
  GEMINI_API_KEY: optionalStr,
  // Modelo de CHAT/ASESORÍA (override opcional). Cuando NO está seteada, el default lo pone el
  // código: CHAT_MODEL en gemini.ts (gemini-3.1-flash-lite). NO lleva default de Zod: el viejo
  // "gemini-3.5-flash" era un modelo inexistente que ganaba siempre y hacía pegar al chat a un 404.
  // La visión/recibos NO usa esta env (queda fija en flash barato). Seteala solo para revertir o
  // probar otro motor sin tocar código.
  GEMINI_MODEL: optionalStr,
  FINNHUB_TOKEN: optionalStr,
  ALPHA_VANTAGE_KEY: optionalStr,
  // CoinGecko Demo API key (plan gratuito con registro). Si está, se manda en el header
  // x-cg-demo-api-key en TODAS las llamadas → mucho más rate limit que el endpoint público
  // (IPs compartidas de serverless se rate-limitean rápido). Opcional: sin ella funciona keyless
  // (como en local/dev). En PROD conviene setearla para que el ATH/precio no falle por 429.
  COINGECKO_API_KEY: optionalStr,
  // Indicadores económicos — Costa Rica (API SDDE del BCCR, REST/JSON con Bearer).
  // Registro/suscripción en https://www.bccr.fi.cr/indicadores-economicos (token JWT).
  BCCR_SDDE_TOKEN: optionalStr, // token Bearer (JWT) de la suscripción SDDE
  BCCR_SDDE_EMAIL: optionalStr, // correo de la suscripción (informativo / ValideSuscripcion)
  // Indicadores económicos — EE. UU. (FRED, St. Louis Fed). Key gratis.
  FRED_API_KEY: optionalStr,
  // Email (invitaciones de familia). Si faltan, el envío se omite con gracia.
  // Vía 1 (recomendada): SMTP de Google Workspace / Gmail con App Password.
  SMTP_HOST: optionalStr, // p. ej. smtp.gmail.com
  SMTP_PORT: optionalStr, // 465 (SSL) o 587 (STARTTLS)
  SMTP_USER: optionalStr, // correo del Workspace, p. ej. invitaciones@tudominio.com
  SMTP_PASS: optionalStr, // App Password de Google (no la contraseña normal)
  // Vía 2 (alternativa): Resend.
  RESEND_API_KEY: optionalStr,
  EMAIL_FROM: optionalStr, // remitente, p. ej. "CARTERA+ <invitaciones@tudominio.com>"
  REDIS_URL: optionalStr,
  // Upstash Redis (REST): rate-limit coherente entre instancias serverless en
  // Vercel. Si faltan, el rate-limit cae a memoria por instancia (solo dev/local).
  UPSTASH_REDIS_REST_URL: optionalStr, // https://<db>.upstash.io
  UPSTASH_REDIS_REST_TOKEN: optionalStr, // token REST de la base Upstash
  // Alertas operativas → Slack Incoming Webhook. Si falta, las alertas solo
  // quedan en el log (no se notifica a nadie).
  SLACK_ALERT_WEBHOOK_URL: optionalStr, // https://hooks.slack.com/services/...
  TURNSTILE_SECRET_KEY: optionalStr,
  PAYMENT_WEBHOOK_SECRET: optionalStr,
  // Stripe. Si faltan, la app corre igual pero sin cobro: la página de
  // suscripción lo dice en vez de romperse con un checkout que no existe.
  STRIPE_SECRET_KEY: optionalStr, // sk_live_... / sk_test_...
  STRIPE_WEBHOOK_SECRET: optionalStr, // whsec_... del endpoint de Stripe
  CRON_SECRET: optionalStr,
  // Firma HMAC de los tokens de baja de correo (ruta pública). Si falta, la baja
  // por enlace se degrada con un error controlado (no crashea).
  UNSUBSCRIBE_SECRET: optionalStr,
  // Ingesta por correo (IMAP). Buzón donde los usuarios reenvían sus correos de
  // banco. Si GMAIL_IMAP_USER/PASSWORD faltan, el poller se omite con gracia.
  // Usar App Password de Google (NO la contraseña normal de la cuenta).
  GMAIL_IMAP_HOST: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().min(1).default("imap.gmail.com"),
  ),
  GMAIL_IMAP_USER: optionalStr, // correo del buzón de ingesta
  GMAIL_IMAP_APP_PASSWORD: optionalStr, // App Password (16 chars) de Google
  // Dominio de las direcciones de ingesta ÚNICAS por cuenta
  // (u<token>@in.aitechumbrella.com). Requiere que ese subdominio entregue todo
  // su correo al buzón de arriba (catch-all de Google Workspace con la casilla
  // «Add X-Gm-Original-To header» activada). Si falta, la app no ofrece
  // direcciones únicas y solo queda el carril heredado de la dirección plana.
  INGEST_ADDRESS_DOMAIN: optionalStr,
});

type ClientEnv = z.infer<typeof clientSchema>;
type ServerEnv = z.infer<typeof serverSchema>;

function format(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
}

let clientCache: ClientEnv | null = null;
let serverCache: ServerEnv | null = null;

export function getClientEnv(): ClientEnv {
  if (clientCache) return clientCache;
  // Las NEXT_PUBLIC_* se inlinean en build; referenciarlas explícitamente.
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
  if (!parsed.success) {
    throw new Error(`[env] Variables de cliente inválidas o ausentes:\n${format(parsed.error)}`);
  }
  clientCache = parsed.data;
  return clientCache;
}

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("[env] getServerEnv() no puede usarse en el cliente.");
  }
  if (serverCache) return serverCache;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`[env] Variables de servidor inválidas o ausentes:\n${format(parsed.error)}`);
  }
  serverCache = parsed.data;
  return serverCache;
}
