/**
 * Deterministic price mock for the DCA case. `getMarketPrice` reads the in-process
 * `priceCache` cache-first (globalThis.__caMarketCache); pre-seeding it makes the
 * quoted holding's price DETERMINISTIC and never hits the network. Must run before
 * `ensureMonthlyContributions` AND before any net-worth/portfolio read that values
 * the quoted holding — re-seed each month (TTL is 60s for stock/etf).
 */
import { priceCache, TTL } from "@/lib/market-data/cache";
import type { AssetType } from "@/lib/market-data";

export function seedPrice(assetType: AssetType, symbol: string, price: number, currency: string): void {
  const key = `price:${assetType}:${symbol.trim().toUpperCase()}`;
  const ttl = assetType === "crypto" ? TTL.crypto : TTL.stock;
  // Structural Quote { price, currency, provider }; getMarketPrice returns it as a cache hit.
  priceCache.set(key, { price, currency, provider: "sim-mock" }, ttl);
}
