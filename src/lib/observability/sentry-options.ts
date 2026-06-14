/**
 * Opciones compartidas de Sentry (revisión F7). DORMANTE sin DSN: si
 * NEXT_PUBLIC_SENTRY_DSN no está, `enabled` es false y el SDK no envía nada
 * (seguro de mergear antes de configurar el proyecto en Vercel).
 *
 * App financiera → cero PII: sin datos por defecto + scrubbing de correos e
 * importes en `beforeSend`.
 */
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
/** Secuencias largas de dígitos (montos/cuentas) con separadores opcionales. */
const MONEY_RE = /\b\d[\d.,\s]{4,}\d\b/g;

function scrub(value: string): string {
  return value.replace(EMAIL_RE, "[email]").replace(MONEY_RE, "[monto]");
}

/** Limpia recursivamente strings de PII en el evento antes de enviarlo. */
export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  if (!SENTRY_DSN) return null; // doble seguro: nunca enviar sin DSN.
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return scrub(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  return walk(event) as ErrorEvent;
}

export const COMMON_INIT = {
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  ignoreErrors: ["NEXT_REDIRECT", "NEXT_NOT_FOUND"] as (string | RegExp)[],
  beforeSend,
};
