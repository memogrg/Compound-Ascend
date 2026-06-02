/**
 * Rate limiting (ventana fija) con abstracción de almacenamiento.
 *
 * - Si existe REDIS_URL en el futuro, se enchufa un store Redis (mismo interfaz).
 * - Fallback seguro: store en memoria con expiración por entrada.
 *
 * Buckets recomendados (más estrictos): auth, ai-chat, receipt-scan,
 * market-data, password-reset.
 */
import { logger } from "@/lib/logger";

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  limit: number;
  resetAt: number; // epoch ms
};

interface RateStore {
  hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

/** Store en memoria. Adecuado para una sola instancia; usar Redis al escalar. */
class MemoryRateStore implements RateStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    const cur = this.buckets.get(key);
    if (!cur || cur.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      this.gc(now);
      return fresh;
    }
    cur.count += 1;
    return cur;
  }

  private gc(now: number) {
    if (this.buckets.size < 5000) return;
    for (const [k, v] of this.buckets) {
      if (v.resetAt <= now) this.buckets.delete(k);
    }
  }
}

const store: RateStore = new MemoryRateStore();

if (process.env.REDIS_URL) {
  // Placeholder: en F6/hardening se añade un RedisRateStore con la misma interfaz.
  logger.info("rate-limit: REDIS_URL presente; usando memoria hasta integrar Redis");
}

export type RateLimitConfig = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  default: { limit: 60, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
  passwordReset: { limit: 5, windowMs: 15 * 60_000 },
  aiChat: { limit: 20, windowMs: 60_000 },
  receiptScan: { limit: 10, windowMs: 60_000 },
  marketData: { limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitConfig>;

/**
 * Aplica rate limit. `identity` debe combinar IP y/o user id.
 * Ej.: `rateLimit("ai-chat:" + userId, RATE_LIMITS.aiChat)`
 */
export async function rateLimit(
  identity: string,
  config: RateLimitConfig = RATE_LIMITS.default,
): Promise<RateLimitResult> {
  const { count, resetAt } = await store.hit(identity, config.windowMs);
  const remaining = Math.max(0, config.limit - count);
  const ok = count <= config.limit;
  if (!ok) {
    logger.warn("rate-limit excedido", { bucket: identity.split(":")[0] });
  }
  return { ok, remaining, limit: config.limit, resetAt };
}

/** Extrae una IP aproximada de las cabeceras de la petición. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
