/**
 * Cache de precios: memoria (L1) + Redis/Upstash compartido (L2) vía `TtlCache`, el mismo
 * adaptador y credenciales que rate-limit (UPSTASH_REDIS_REST_URL/_TOKEN). Sin Upstash degrada
 * a memoria pura. La interfaz de `priceCache` es la de siempre (get/set síncronos).
 */
import { TtlCache } from "@/lib/cache/ttl-cache";

// Singleton anclado a globalThis para sobrevivir al aislamiento de módulos / HMR de Next en
// desarrollo (en producción una instancia basta).
const g = globalThis as unknown as { __caMarketCache?: TtlCache };
const cache: TtlCache = (g.__caMarketCache ??= new TtlCache("market-data", 1000));

export const priceCache = {
  get<T>(key: string): T | null {
    return cache.get<T>(key);
  },
  set<T>(key: string, value: T, ttlSeconds: number): void {
    cache.set(key, value, ttlSeconds);
  },
};

/** TTL por tipo de activo (segundos), según el documento técnico. */
export const TTL = {
  stock: 60,
  etf: 60,
  crypto: 300,
  search: 300,
  // El sparkline es una serie diaria: cambia poco intradía, se cachea más tiempo.
  sparkline: 1800,
  // Máximos (ATH / 52-sem): se mueven lento → caché de horas ⇒ ~1 llamada por moneda por día,
  // casi sin tocar el rate limit de CoinGecko. `highlightsStale` = "último bueno" para servir ante 429.
  highlights: 6 * 3600, // 6 h
  highlightsStale: 7 * 24 * 3600, // 7 días
} as const;
