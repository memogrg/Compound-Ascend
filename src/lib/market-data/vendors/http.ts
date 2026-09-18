import type { VendorDeps, VendorId } from "./types.ts";

export type HttpResult = { ok: boolean; status: number | "timeout" | "network"; body: unknown };

/**
 * GET con timeout que NUNCA lanza: devuelve el status para que el log diga POR QUÉ falló (un 401
 * es una llave vencida; un timeout, un proveedor lento). Cobra los créditos ANTES de pedir: una
 * llamada que falla igual cuenta contra el plan.
 */
export async function getJson(
  deps: VendorDeps,
  vendor: VendorId,
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; credits?: number } = {},
): Promise<HttpResult> {
  deps.charge?.(vendor, opts.credits ?? 1);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await deps.fetch(url, { headers: opts.headers, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    return { ok: true, status: res.status, body: await res.json() };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, status: aborted ? "timeout" : "network", body: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Número > 0 y finito (acepta strings, que es como responden Finnhub y Twelve Data), o null. */
export function positive(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Como `positive` pero admite 0 y negativos: la variación del día puede caer. */
export function signed(v: unknown): number | undefined {
  const raw = typeof v === "string" ? parseFloat(v.replace(/%/g, "")) : v;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

/** "2026-09-18T..." o epoch → "YYYY-MM-DD". null si no se entiende. */
export function isoDate(v: unknown): string | null {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (typeof v === "number" && Number.isFinite(v)) {
    const ms = v > 1e12 ? v : v * 1000; // milisegundos (Massive) o segundos (Twelve Data)
    return new Date(ms).toISOString().slice(0, 10);
  }
  return null;
}

/** Epoch en ms, s o ns → ISO. Massive manda `updated` en nanosegundos. */
export function isoInstant(v: unknown): string | null {
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  const ms = v > 1e17 ? v / 1e6 : v > 1e12 ? v : v * 1000;
  return new Date(ms).toISOString();
}
