import "server-only";

/**
 * Persiste un precio obtenido de un proveedor externo en market_price_cache.
 * Fire-and-forget: los errores se registran en el log pero no propagan.
 * Solo service-role puede escribir en esta tabla.
 */
import { logger } from "@/lib/logger";
import type { AssetType } from "@/lib/market-data";

export function persistMarketPrice(
  symbol: string,
  assetType: AssetType,
  price: number,
  currency: string,
  provider: string,
): void {
  void (async () => {
    try {
      const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
      const supabase = createServiceRoleClient();
      const ttl = assetType === "crypto" ? 300 : 60;
      await supabase.from("market_price_cache").upsert(
        {
          symbol: symbol.toUpperCase(),
          asset_type: assetType,
          price,
          currency,
          provider,
          fetched_at: new Date().toISOString(),
          ttl_seconds: ttl,
        },
        { onConflict: "symbol,asset_type" },
      );
    } catch (err) {
      logger.warn("persistMarketPrice: no se pudo guardar el precio", {
        symbol,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
