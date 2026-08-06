import "server-only";

/**
 * Recolector de datos de mercado (cron). Junta los símbolos DISTINTOS que el usuario tiene en
 * holdings + price_alerts, trae precio + ATH/máximo en 1-2 llamadas batched (cripto: /coins/markets;
 * acciones/ETF: Finnhub 52-sem, por-símbolo) y hace UPSERT al store market_price_cache. La app, el AI,
 * la valuación y las alertas LEEN de ese store — sin pegarle a CoinGecko en vivo por consulta.
 *
 * Best-effort: un símbolo que falla no frena a los demás. Service-role (sin sesión): recorre TODOS
 * los usuarios. Loguea el status de cada llamada (instrumentación) para saber si el fetch responde.
 */
import { logger } from "@/lib/logger";
import { isValidPrice } from "@/lib/market-data/validity";

/** asset_type del holding → tipo de mercado del feed. */
const MARKET_TYPE: Record<string, "stock" | "etf" | "crypto"> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

type SymbolTarget = { symbol: string; marketType: "stock" | "etf" | "crypto" };

/** Símbolos DISTINTOS a recolectar: de holdings cotizados + alertas de precio activas. */
export async function collectTargets(): Promise<SymbolTarget[]> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const seen = new Set<string>();
  const out: SymbolTarget[] = [];
  const add = (symbol: string | null, assetType: string | null) => {
    const s = (symbol ?? "").trim().toUpperCase();
    const mt = MARKET_TYPE[assetType ?? ""];
    if (!s || !mt) return;
    const key = `${s}|${mt}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ symbol: s, marketType: mt });
  };

  const [holdings, alerts] = await Promise.all([
    admin
      .from("investment_holdings")
      .select("symbol, asset_type")
      .in("asset_type", ["etf", "accion", "cripto"]),
    admin.from("price_alerts").select("symbol, asset_type").eq("kind", "price").eq("active", true),
  ]);
  for (const h of holdings.data ?? []) add(h.symbol, h.asset_type);
  for (const a of alerts.data ?? []) add(a.symbol, a.asset_type);
  return out;
}

/** Upsert de UNA fila del store (service-role). Solo escribe los campos con dato (deja el resto). */
async function upsertStore(row: {
  symbol: string;
  assetType: string;
  price: number | null;
  currency: string;
  provider: string;
  athUsd: number | null;
  athDate: string | null;
  high24h: number | null;
  highKind: "ath" | "52w" | null;
}): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  // INTEGRIDAD: un precio inválido (≤0, null, NaN) es basura del proveedor (timeout/vacío). NO
  // sobreescribimos la fila → se PRESERVA el último valor bueno y su fecha (nunca guardamos "$0").
  if (!isValidPrice(row.price)) return;
  // El ATH sigue la misma regla: si vino inválido, se OMITE del payload (no se manda la clave) para
  // que el upsert conserve el ATH previo en vez de pisarlo con null.
  const athFields = isValidPrice(row.athUsd)
    ? {
        ath_usd: row.athUsd,
        ath_date: row.athDate,
        high_24h: isValidPrice(row.high24h) ? row.high24h : null,
        high_kind: row.highKind,
      }
    : {};
  await admin.from("market_price_cache").upsert(
    {
      symbol: row.symbol,
      asset_type: row.assetType,
      price: row.price,
      currency: row.currency,
      provider: row.provider,
      fetched_at: new Date().toISOString(),
      ttl_seconds: row.assetType === "crypto" ? 300 : 60,
      ...athFields,
    },
    { onConflict: "symbol,asset_type" },
  );
}

export type CollectResult = { targets: number; crypto: number; stock: number; written: number };

/**
 * Corre una recolección: 1 llamada batched para todas las cripto (/coins/markets con ids coma) +
 * Finnhub por acción/ETF. Upsert al store. Devuelve conteos para el log del cron.
 */
export async function runCollection(): Promise<CollectResult> {
  const { coingeckoMarketsBatch, finnhubHighlights } = await import("@/lib/market-data/providers");
  const targets = await collectTargets();
  const cryptoSymbols = targets.filter((t) => t.marketType === "crypto").map((t) => t.symbol);
  const stockTargets = targets.filter((t) => t.marketType !== "crypto");
  let written = 0;

  // CRIPTO: UNA llamada batched para TODAS (precio + ATH). asset_type del store = "crypto" (MARKET
  // type — el mismo que escribe persistMarketPrice y lee fetchCachedPrices; NO el holding "cripto").
  if (cryptoSymbols.length > 0) {
    const rows = await coingeckoMarketsBatch(cryptoSymbols);
    for (const [symbol, r] of Object.entries(rows)) {
      try {
        await upsertStore({
          symbol,
          assetType: "crypto",
          price: r.price,
          currency: "USD",
          provider: "coingecko",
          athUsd: r.ath,
          athDate: r.athDate,
          high24h: r.high24h,
          highKind: isValidPrice(r.ath) ? "ath" : null,
        });
        if (isValidPrice(r.price)) written += 1;
      } catch (err) {
        logger.error("collector: upsert cripto falló", {
          symbol,
          message: err instanceof Error ? err.message : "?",
        });
      }
    }
  }

  // ACCIONES/ETF: Finnhub por símbolo (no batchea gratis; el volumen es menor). Máx = 52 semanas.
  // asset_type del store = market type ("stock"/"etf").
  for (const t of stockTargets) {
    try {
      const h = await finnhubHighlights(t.symbol);
      if (!h) continue;
      await upsertStore({
        symbol: t.symbol,
        assetType: t.marketType, // "stock" | "etf"
        price: h.price,
        currency: h.currency,
        provider: "finnhub",
        athUsd: h.high, // para acciones el "máximo" es 52-sem (high_kind lo distingue)
        athDate: h.highDate,
        high24h: null,
        highKind: h.highKind, // '52w'
      });
      if (isValidPrice(h.price)) written += 1;
    } catch (err) {
      logger.error("collector: upsert acción falló", {
        symbol: t.symbol,
        message: err instanceof Error ? err.message : "?",
      });
    }
  }

  const result: CollectResult = {
    targets: targets.length,
    crypto: cryptoSymbols.length,
    stock: stockTargets.length,
    written,
  };
  logger.info("market-data.collect", result);
  return result;
}
