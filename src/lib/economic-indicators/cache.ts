/**
 * Cache de lecturas de indicadores (TTL largo: los datos macro cambian lento). Memoria (L1) +
 * Redis/Upstash compartido (L2) vía `TtlCache`, el mismo adaptador y credenciales que rate-limit.
 * Sin Upstash degrada a memoria pura. La interfaz de `indicatorCache` no cambia (get/set síncronos).
 */
import { TtlCache } from "@/lib/cache/ttl-cache";

const g = globalThis as unknown as { __caIndicatorCache?: TtlCache };
const cache: TtlCache = (g.__caIndicatorCache ??= new TtlCache("economic-indicators", 500));

export const indicatorCache = {
  get<T>(key: string): T | null {
    return cache.get<T>(key);
  },
  set<T>(key: string, value: T, ttlSeconds: number): void {
    cache.set(key, value, ttlSeconds);
  },
};

/** TTL de lecturas de BD (segundos). Los indicadores se refrescan a diario. */
export const TTL = {
  read: 1800, // 30 min
} as const;
