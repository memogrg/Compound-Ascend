/**
 * Logging estructurado (JSON) centralizado.
 * Nunca registra secretos. Acepta metadatos serializables.
 *
 * En el futuro se puede enchufar a un transporte externo (Sentry, Logtail…)
 * sin cambiar los call-sites.
 */

type Level = "debug" | "info" | "warn" | "error";

type Meta = Record<string, unknown>;

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const minLevel: Level = process.env.APP_ENV === "production" ? "info" : "debug";

// Claves que nunca deben aparecer en logs.
const REDACT = /(key|token|secret|password|authorization|cookie)/i;

function sanitize(meta?: Meta): Meta | undefined {
  if (!meta) return undefined;
  const out: Meta = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = REDACT.test(k) ? "[redacted]" : v;
  }
  return out;
}

function emit(level: Level, message: string, meta?: Meta): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...sanitize(meta),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, meta?: Meta) => emit("debug", msg, meta),
  info: (msg: string, meta?: Meta) => emit("info", msg, meta),
  warn: (msg: string, meta?: Meta) => emit("warn", msg, meta),
  error: (msg: string, meta?: Meta) => emit("error", msg, meta),
};
