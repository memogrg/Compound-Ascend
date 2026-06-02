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
  FINNHUB_TOKEN: optionalStr,
  ALPHA_VANTAGE_KEY: optionalStr,
  REDIS_URL: optionalStr,
  TURNSTILE_SECRET_KEY: optionalStr,
  PAYMENT_WEBHOOK_SECRET: optionalStr,
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
