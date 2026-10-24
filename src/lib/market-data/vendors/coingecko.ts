import { getJson, isoDate, isoInstant, positive, signed } from "./http.ts";
import type { CoingeckoPlan, MarketVendor, VendorDeps, VendorHighlight } from "./types.ts";

/**
 * Host y header según el plan. Los planes PAGOS (Basic incluido) usan `pro-api` con
 * `x-cg-pro-api-key`; la Demo gratis usa el host público con `x-cg-demo-api-key`. Mezclarlos
 * no degrada: la llamada falla. Por eso el plan se declara (`COINGECKO_API_PLAN`) — las dos
 * llaves empiezan igual y no se pueden distinguir mirándolas.
 *
 * Sin llave se usa el host público sin header, que es como corría antes de tener una.
 */
export function coingeckoApi(
  plan: CoingeckoPlan,
  key: string | undefined,
): { base: string; headers: Record<string, string> } {
  if (!key) return { base: "https://api.coingecko.com/api/v3", headers: {} };
  return plan === "pro"
    ? { base: "https://pro-api.coingecko.com/api/v3", headers: { "x-cg-pro-api-key": key } }
    : { base: "https://api.coingecko.com/api/v3", headers: { "x-cg-demo-api-key": key } };
}

/**
 * Ticker → id de CoinGecko, lista CURADA (rápido, sin red, sin colisiones de símbolo).
 *
 * Para sumar uno: VERIFICÁ el id contra la API real ANTES de hardcodearlo — NO de memoria. Un
 * id equivocado mapea al precio de OTRA moneda. Consultá `/search?query=<TICKER>`, elegí el coin
 * cuyo `symbol` coincide Y con mejor `market_cap_rank`, y usá ESE id.
 *
 * Antes vivía dos veces (providers.ts y el script del colector, "mantener en sync"). Ahora vive
 * acá y los dos lo importan.
 */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  LINK: "chainlink",
  MATIC: "matic-network",
  DOT: "polkadot",
  LTC: "litecoin",
  BNB: "binancecoin",
  TRX: "tron",
  SUI: "sui",
  APT: "aptos",
  // Añadidos — verificados vía /search contra la API real (id + market_cap_rank):
  ONDO: "ondo-finance", // Ondo (Ondo Finance) · rank ~41
  KMNO: "kamino", // Kamino · rank ~278
  JUP: "jupiter-exchange-solana", // Jupiter en Solana · rank ~87 (NO "jupiter" = "Jupiter Project" muerto, rank ~4424)
  AERO: "aerodrome-finance", // Aerodrome Finance (Base) · rank ~109
};

/**
 * Elige el mejor coin por símbolo entre los resultados de /search. Puro y testeable.
 * Se DESCARTAN los matches con `market_cap_rank` null — tokens muertos/scam que reusan un
 * símbolo popular no tienen market cap. De los que quedan, el de mejor rank. Ninguno → null
 * (mejor sin precio que un precio falso).
 */
export function pickCoingeckoMatch(
  coins: { id: string; symbol: string; market_cap_rank: number | null }[],
  ticker: string,
): string | null {
  const key = ticker.toUpperCase();
  const match = coins
    .filter((c) => c.symbol?.toUpperCase() === key && c.market_cap_rank != null)
    .sort((a, b) => (a.market_cap_rank as number) - (b.market_cap_rank as number))[0];
  return match?.id ?? null;
}

// Resoluciones por /search, con el miss incluido: un ticker inexistente no debe re-pegar /search en
// cada corrida. Con TTL, para que un 429 puntual no quede pegado para siempre.
const resolved = new Map<string, { id: string | null; at: number }>();
const RESOLVE_TTL_MS = 6 * 60 * 60 * 1000;

async function resolveId(deps: VendorDeps, ticker: string): Promise<string | null> {
  const key = ticker.toUpperCase();
  const curated = COINGECKO_IDS[key];
  if (curated) return curated;
  const hit = resolved.get(key);
  if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.id;
  const api = coingeckoApi(deps.coingeckoPlan, deps.keys.coingecko);
  const r = await getJson(
    deps,
    "coingecko",
    `${api.base}/search?query=${encodeURIComponent(ticker)}`,
    {
      headers: api.headers,
      timeoutMs: 12000,
    },
  );
  if (!r.ok) return null; // 429/timeout: NO se cachea como miss, se reintenta la próxima
  const coins =
    (r.body as { coins?: Parameters<typeof pickCoingeckoMatch>[0] } | null)?.coins ?? [];
  const id = pickCoingeckoMatch(coins, ticker);
  resolved.set(key, { id, at: Date.now() });
  return id;
}

type MarketsRow = {
  id?: string;
  current_price?: number;
  high_24h?: number;
  ath?: number;
  ath_date?: string;
  atl?: number;
  atl_date?: string;
  market_cap_rank?: number | null;
  price_change_percentage_24h?: number;
  last_updated?: string;
};

/** `/coins/markets` acepta hasta 250 por página: más ids se piden en tandas. */
const PAGE = 250;

export function createCoingecko(deps: VendorDeps): MarketVendor {
  async function highlights(symbols: string[]): Promise<Record<string, VendorHighlight>> {
    const out: Record<string, VendorHighlight> = {};
    const idToSymbol = new Map<string, string>();
    for (const raw of symbols) {
      const s = raw.trim().toUpperCase();
      const id = await resolveId(deps, s);
      if (id && !idToSymbol.has(id)) idToSymbol.set(id, s);
    }
    const ids = [...idToSymbol.keys()];
    const api = coingeckoApi(deps.coingeckoPlan, deps.keys.coingecko);

    for (let i = 0; i < ids.length; i += PAGE) {
      const tanda = ids.slice(i, i + PAGE);
      const url = `${api.base}/coins/markets?vs_currency=usd&per_page=${PAGE}&ids=${tanda.map(encodeURIComponent).join(",")}`;
      const r = await getJson(deps, "coingecko", url, { headers: api.headers, timeoutMs: 12000 });
      if (!r.ok || !Array.isArray(r.body)) {
        deps.warn?.(`coingecko /coins/markets status=${r.status} ids=${tanda.length}`);
        continue;
      }
      for (const row of r.body as MarketsRow[]) {
        const s = row.id ? idToSymbol.get(row.id) : undefined;
        if (!s) continue;
        const ath = positive(row.ath);
        out[s] = {
          symbol: s,
          price: positive(row.current_price),
          currency: "USD",
          asOf: isoInstant(row.last_updated),
          high: ath,
          highDate: isoDate(row.ath_date),
          highKind: ath !== null ? "ath" : null,
          high24h: positive(row.high_24h),
          changePct: signed(row.price_change_percentage_24h),
          atl: positive(row.atl),
          atlDate: isoDate(row.atl_date),
          marketCapRank: typeof row.market_cap_rank === "number" ? row.market_cap_rank : null,
        };
      }
    }
    return out;
  }

  return {
    id: "coingecko",
    kinds: ["crypto"],
    // Un solo endpoint trae precio y ATH juntos: pedir solo el precio no ahorra nada.
    getQuotes: highlights,
    getHighlights: highlights,
  };
}
