/**
 * Cache de precios: dual-layer Redis (si REDIS_URL) → memoria con TTL.
 * Hoy se usa el fallback en memoria (1000 entradas, evicción por TTL). El
 * adaptador Redis se enchufa con la misma interfaz cuando se integre el cliente,
 * igual que en rate-limit.
 */
import { logger } from "@/lib/logger";

type Entry<T> = { value: T; expiresAt: number };

class MemoryTTLCache {
  private store = new Map<string, Entry<unknown>>();
  private max = 1000;

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
    // Si sigue lleno, elimina el más antiguo insertado.
    if (this.store.size >= this.max) {
      const first = this.store.keys().next().value;
      if (first) this.store.delete(first);
    }
  }
}

// Singleton anclado a globalThis para sobrevivir al aislamiento de módulos / HMR
// de Next en desarrollo (en producción una instancia basta).
const g = globalThis as unknown as { __caMarketCache?: MemoryTTLCache };
const memory: MemoryTTLCache = (g.__caMarketCache ??= new MemoryTTLCache());

if (process.env.REDIS_URL) {
  logger.info("market-data: REDIS_URL presente; usando memoria hasta integrar Redis");
}

export const priceCache = {
  get<T>(key: string): T | null {
    return memory.get<T>(key);
  },
  set<T>(key: string, value: T, ttlSeconds: number): void {
    memory.set(key, value, ttlSeconds);
  },
};

/** TTL por tipo de activo (segundos), según el documento técnico. */
export const TTL = {
  stock: 60,
  etf: 60,
  crypto: 300,
  search: 300,
} as const;
