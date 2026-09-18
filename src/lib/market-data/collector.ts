import "server-only";

/**
 * Recolector de datos de mercado (cron). Junta los símbolos DISTINTOS que el usuario tiene en
 * holdings + price_alerts, trae precio + ATH/máximo por la cadena de proveedores configurada
 * (src/lib/market-data/vendors) y hace UPSERT al store market_price_cache. La app, el AI,
 * la valuación y las alertas LEEN de ese store — sin pegarle a CoinGecko en vivo por consulta.
 *
 * Best-effort: un símbolo que falla no frena a los demás. Service-role (sin sesión): recorre TODOS
 * los usuarios. Loguea el status de cada llamada (instrumentación) para saber si el fetch responde.
 */
import { logger } from "@/lib/logger";
import {
  buildChain,
  buildStoreRow,
  fetchWithFallback,
  marketConfigFromEnv,
  type ChainRow,
  type StoreRow,
} from "@/lib/market-data/vendors";

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

/**
 * Upsert de UNA fila del store (service-role). La fila ya viene armada por buildStoreRow, que es
 * el que decide qué NO se escribe (precio inválido) y qué columnas se omiten (máximo inválido).
 */
async function upsertStore(row: StoreRow): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  await admin.from("market_price_cache").upsert(row, { onConflict: "symbol,asset_type" });
}

export type CollectResult = { targets: number; crypto: number; stock: number; written: number };

/**
 * Corre una recolección con la cadena configurada de cada tipo de activo —la MISMA capa que el
 * colector de GitHub Actions, con la env de Vercel— y upsertea al store.
 *
 * Este camino es la ruta /api/market-data/refresh, que no está en los crons de vercel.json: el
 * colector que corre de verdad es scripts/market-data-collect.ts. Se mantiene al día para que no
 * sea un tercer comportamiento distinto el día que alguien lo dispare a mano.
 */
export async function runCollection(): Promise<CollectResult> {
  const { getServerEnv } = await import("@/lib/env");
  const targets = await collectTargets();
  const cryptoSymbols = targets.filter((t) => t.marketType === "crypto").map((t) => t.symbol);
  const stockTargets = targets.filter((t) => t.marketType !== "crypto");
  const warn = (msg: string) => logger.warn("collector.vendor", { msg });
  const cfg = marketConfigFromEnv(getServerEnv(), warn);
  const deps = {
    fetch: ((i: RequestInfo | URL, n?: RequestInit) => fetch(i, n)) as typeof fetch,
    warn,
  };
  let written = 0;

  const escribir = async (row: ChainRow, assetType: string) => {
    const payload = buildStoreRow(row, assetType);
    if (!payload) return;
    try {
      await upsertStore(payload);
      written += 1;
    } catch (err) {
      logger.error("collector: upsert falló", {
        symbol: row.symbol,
        message: err instanceof Error ? err.message : "?",
      });
    }
  };

  // CRIPTO. asset_type del store = "crypto" (MARKET type — el mismo que escribe persistMarketPrice y
  // lee fetchCachedPrices; NO el holding "cripto").
  if (cryptoSymbols.length > 0) {
    const r = await fetchWithFallback(
      buildChain("crypto", cfg, deps),
      cryptoSymbols,
      "highlights",
      warn,
    );
    for (const row of Object.values(r.rows)) await escribir(row, "crypto");
  }

  // ACCIONES/ETF. El store separa "stock" de "etf"; los proveedores no: se pide junto y cada fila
  // vuelve a su asset_type.
  if (stockTargets.length > 0) {
    const tipos = new Map<string, Set<string>>();
    for (const t of stockTargets) {
      if (!tipos.has(t.symbol)) tipos.set(t.symbol, new Set());
      tipos.get(t.symbol)!.add(t.marketType);
    }
    const r = await fetchWithFallback(
      buildChain("stock", cfg, deps),
      [...tipos.keys()],
      "highlights",
      warn,
    );
    for (const row of Object.values(r.rows)) {
      for (const assetType of tipos.get(row.symbol) ?? []) await escribir(row, assetType);
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
