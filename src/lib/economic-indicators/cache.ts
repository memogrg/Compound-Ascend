/**
 * Cache en memoria para lecturas de indicadores (TTL largo: los datos macro
 * cambian lento). Mismo enfoque que market-data/cache.ts: fallback en memoria
 * con singleton anclado a globalThis; el adaptador Redis se enchufa después con
 * la misma interfaz.
 */
import { logger } from "@/lib/logger";

type Entry<T> = { value: T; expiresAt: number };

class MemoryTTLCache {
  private store = new Map<string, Entry<unknown>>();
  private max = 500;

  get<T>(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (this.store.size >= this.max) this.evict();
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
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

const g = globalThis as unknown as { __caIndicatorCache?: MemoryTTLCache };
const memory: MemoryTTLCache = (g.__caIndicatorCache ??= new MemoryTTLCache());

if (process.env.REDIS_URL) {
  logger.info("economic-indicators: REDIS_URL presente; usando memoria hasta integrar Redis");
}

export const indicatorCache = {
  get<T>(key: string): T | null {
    return memory.get<T>(key);
  },
  set<T>(key: string, value: T, ttlSeconds: number): void {
    memory.set(key, value, ttlSeconds);
  },
};

/** TTL de lecturas de BD (segundos). Los indicadores se refrescan a diario. */
export const TTL = {
  read: 1800, // 30 min
} as const;
