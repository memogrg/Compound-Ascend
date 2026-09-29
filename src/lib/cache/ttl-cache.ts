/**
 * Cache TTL con capa compartida opcional en Redis/Upstash — el MISMO cliente y las MISMAS
 * credenciales que `src/lib/rate-limit/index.ts` (UPSTASH_REDIS_REST_URL/_TOKEN).
 *
 * La interfaz que ven los llamadores es SÍNCRONA (get/set devuelven valor, no promesa): no
 * cambia respecto al cache en memoria anterior. Redis es una capa L2 coherente entre instancias,
 * poblada sin bloquear:
 *   - `set` escribe en memoria (L1) y dispara una escritura a Redis (fire-and-forget).
 *   - `get` responde desde memoria; en fallo de L1, dispara una lectura a Redis que CALIENTA la
 *     memoria para la próxima vez, y devuelve null ahora (el llamador ya trata el miss).
 * Sin Upstash (CI y local) degrada a memoria pura, sin tocar la red. Cualquier fallo de Redis en
 * runtime se registra y se degrada a memoria: nunca tumba al llamador.
 */
import { Redis } from "@upstash/redis";
import { logger } from "@/lib/logger";

export type Entry<T> = { value: T; expiresAt: number };

/** Cliente mínimo que necesita el cache (permite inyectar un doble en tests). */
export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { px?: number }): Promise<unknown>;
}

/** Store en memoria con expiración por entrada y tope de tamaño (evicción por TTL y FIFO). */
export class MemoryTTLCache {
  private store = new Map<string, Entry<unknown>>();

  constructor(private max = 1000) {}

  getEntry(key: string): Entry<unknown> | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e;
  }

  get<T>(key: string): T | null {
    const e = this.getEntry(key);
    return e ? (e.value as T) : null;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.setEntry(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  /** Inserta una entrada ya construida (la usa el calentado desde Redis, que trae su expiresAt). */
  setEntry(key: string, entry: Entry<unknown>): void {
    if (this.store.size >= this.max) this.evict();
    this.store.set(key, entry);
  }

  private evict(): void {
    const now = Date.now();
    for (const [k, v] of this.store) {
      if (v.expiresAt <= now) this.store.delete(k);
    }
    if (this.store.size >= this.max) {
      const first = this.store.keys().next().value;
      if (first) this.store.delete(first);
    }
  }
}

/** Selecciona Upstash si están sus credenciales (mismas que rate-limit); si no, null. */
export function upstashFromEnv(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    return new Redis({ url, token });
  } catch (error) {
    logger.warn("cache: no se pudo iniciar Upstash; se usa memoria", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export class TtlCache {
  private readonly memory: MemoryTTLCache;
  private readonly redis: RedisLike | null;
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly namespace: string,
    max = 1000,
    redis: RedisLike | null = upstashFromEnv(),
  ) {
    this.memory = new MemoryTTLCache(max);
    this.redis = redis;
    if (redis) logger.info(`${namespace}: usando Upstash Redis como capa compartida`);
  }

  private nsKey(key: string): string {
    return `cache:${this.namespace}:${key}`;
  }

  get<T>(key: string): T | null {
    const local = this.memory.get<T>(key);
    if (local !== null) return local;
    if (this.redis) this.track(this.warmFromRedis(key));
    return null;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    this.memory.set(key, value, ttlSeconds);
    if (this.redis) this.track(this.writeToRedis(key, value, ttlSeconds));
  }

  private async writeToRedis(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const entry: Entry<unknown> = { value, expiresAt: Date.now() + ttlSeconds * 1000 };
      await this.redis!.set(this.nsKey(key), entry, { px: ttlSeconds * 1000 });
    } catch (error) {
      logger.warn(`${this.namespace}: escritura a Redis falló, sigue en memoria`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async warmFromRedis(key: string): Promise<void> {
    try {
      const entry = await this.redis!.get<Entry<unknown>>(this.nsKey(key));
      if (entry && entry.expiresAt > Date.now()) this.memory.setEntry(key, entry);
    } catch (error) {
      logger.warn(`${this.namespace}: lectura de Redis falló, se usa memoria`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private track(p: Promise<unknown>): void {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  /** Solo para tests: espera a que terminen las operaciones Redis en vuelo. */
  async whenIdle(): Promise<void> {
    await Promise.all([...this.pending]);
  }
}
