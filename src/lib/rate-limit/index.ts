/**
 * Rate limiting (ventana fija) con abstracción de almacenamiento.
 *
 * - Si existen las credenciales de Upstash (UPSTASH_REDIS_REST_URL/_TOKEN), se
 *   usa un store Redis coherente entre instancias (Vercel multi-lambda).
 * - Fallback seguro: store en memoria con expiración por entrada (dev/local, o
 *   si Redis no está configurado o falla en runtime).
 *
 * Buckets recomendados (más estrictos): auth, ai-chat, receipt-scan,
 * market-data, password-reset.
 */
import { Redis } from "@upstash/redis";
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

/**
 * Store en Redis (Upstash REST). Contador de ventana fija con INCR + PEXPIRE,
 * coherente entre todas las instancias serverless de Vercel.
 *
 * Resiliencia: si Redis falla en runtime (red/cuota), se degrada al store en
 * memoria local en vez de tumbar la petición (fail-open controlado). El evento
 * queda logueado para alertar de la degradación.
 */
class RedisRateStore implements RateStore {
  private readonly prefix = "ratelimit:";
  private readonly fallback = new MemoryRateStore();

  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number) {
    const now = Date.now();
    const redisKey = this.prefix + key;
    try {
      const pipe = this.redis.pipeline();
      pipe.incr(redisKey);
      pipe.pttl(redisKey);
      const [count, ttl] = (await pipe.exec()) as [number, number];

      // Primer hit de la ventana (o key sin TTL) → fijar expiración.
      if (count === 1 || ttl < 0) {
        await this.redis.pexpire(redisKey, windowMs);
        return { count, resetAt: now + windowMs };
      }
      return { count, resetAt: now + ttl };
    } catch (error) {
      logger.warn("rate-limit: Redis falló, degradando a memoria", {
        error: error instanceof Error ? error.message : String(error),
      });
      return this.fallback.hit(key, windowMs);
    }
  }
}

/** Selecciona el store: Redis si hay credenciales Upstash, si no memoria. */
function createStore(): RateStore {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    try {
      const redis = new Redis({ url, token });
      logger.info("rate-limit: usando Upstash Redis (coherente entre instancias)");
      return new RedisRateStore(redis);
    } catch (error) {
      logger.warn("rate-limit: no se pudo iniciar Redis; fallback a memoria", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return new MemoryRateStore();
}

const store: RateStore = createStore();

export type RateLimitConfig = { limit: number; windowMs: number };

export const RATE_LIMITS = {
  default: { limit: 60, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
  passwordReset: { limit: 5, windowMs: 15 * 60_000 },
  aiChat: { limit: 20, windowMs: 60_000 },
  receiptScan: { limit: 10, windowMs: 60_000 },
  marketData: { limit: 60, windowMs: 60_000 },
  // Webhooks firmados: la firma es la defensa real; esto solo corta el costo
  // de CPU de intentos masivos de firma invalida.
  webhook: { limit: 30, windowMs: 60_000 },
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
