import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Env MUTABLE: por defecto sin CoinGecko key (keyless); un test la setea para probar el header.
const env: { FINNHUB_TOKEN: string; ALPHA_VANTAGE_KEY: string; COINGECKO_API_KEY?: string } = {
  FINNHUB_TOKEN: "tok",
  ALPHA_VANTAGE_KEY: "",
};
vi.mock("@/lib/env", () => ({ getServerEnv: () => env }));

import { getMarketHighlights } from "@/lib/market-data";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  env.COINGECKO_API_KEY = undefined;
});

describe("getMarketHighlights · máximo REAL por clase de activo, cacheado (no 503)", () => {
  beforeEach(() => {
    // priceCache es un singleton en memoria; usamos símbolos distintos por test para no cruzar.
  });

  it("cripto → ATH real de CoinGecko (/coins/markets)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/coins/markets")) {
        return { ok: true, json: async () => [{ current_price: 60000, ath: 73000, ath_date: "2024-03-14T00:00:00Z" }] };
      }
      // resolveCoingeckoId (/search) para un ticker no listado
      return { ok: true, json: async () => ({ coins: [{ id: "solana", symbol: "SOL", market_cap_rank: 5 }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const h = await getMarketHighlights("SOL", "crypto");
    expect(h?.highKind).toBe("ath");
    expect(h?.high).toBe(73000);
    expect(h?.highDate).toBe("2024-03-14");
    expect(h?.price).toBe(60000);
  });

  it("acción → máximo de 52 semanas de Finnhub (/stock/metric), NO ath", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/stock/metric")) {
        return { ok: true, json: async () => ({ metric: { "52WeekHigh": 560, "52WeekHighDate": "2025-01-02" } }) };
      }
      return { ok: true, json: async () => ({ c: 500 }) }; // /quote
    });
    vi.stubGlobal("fetch", fetchMock);

    const h = await getMarketHighlights("VOO", "stock");
    expect(h?.highKind).toBe("52w");
    expect(h?.high).toBe(560);
    expect(h?.price).toBe(500);
  });

  it("segunda llamada al MISMO símbolo → cache hit (0 fetch nuevos → no puede dar 503)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/stock/metric")) return { ok: true, json: async () => ({ metric: { "52WeekHigh": 100 } }) };
      return { ok: true, json: async () => ({ c: 90 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await getMarketHighlights("CACHEME", "stock");
    const callsAfterFirst = fetchMock.mock.calls.length;
    fetchMock.mockClear();
    const second = await getMarketHighlights("CACHEME", "stock");
    expect(second?.high).toBe(100);
    expect(fetchMock).not.toHaveBeenCalled(); // servido de caché
    expect(callsAfterFirst).toBeGreaterThan(0);
  });

  it("con COINGECKO_API_KEY → manda el header x-cg-demo-api-key en las llamadas a CoinGecko", async () => {
    env.COINGECKO_API_KEY = "cg-demo-123";
    const seen: Record<string, string | undefined>[] = [];
    const fetchMock = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes("api.coingecko.com")) seen.push(init?.headers ?? {});
      if (url.includes("/coins/markets")) return { ok: true, json: async () => [{ current_price: 1, ath: 2, ath_date: "2024-01-01T00:00:00Z" }] };
      return { ok: true, json: async () => ({ coins: [{ id: "keyedcoin", symbol: "KEYED", market_cap_rank: 10 }] }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await getMarketHighlights("KEYED", "crypto");
    expect(seen.length).toBeGreaterThan(0);
    // TODAS las llamadas a CoinGecko llevan la key.
    for (const h of seen) expect(h["x-cg-demo-api-key"]).toBe("cg-demo-123");
  });

  it("429 → sirve el STALE si existe (no falla); solo sin nada devuelve null", async () => {
    vi.useFakeTimers();
    // 1) Primera llamada OK → puebla fresco (6h) + stale (7d).
    const ok = vi.fn(async (url: string) => {
      if (url.includes("/coins/markets")) return { ok: true, json: async () => [{ current_price: 60000, ath: 73000, ath_date: "2024-03-14T00:00:00Z" }] };
      return { ok: true, json: async () => ({ coins: [{ id: "bitcoin", symbol: "BTC", market_cap_rank: 1 }] }) };
    });
    vi.stubGlobal("fetch", ok);
    const first = await getMarketHighlights("BTC", "crypto");
    expect(first?.high).toBe(73000);

    // 2) Avanza 7h: el fresco (6h) EXPIRÓ, el stale (7d) sigue. Ahora CoinGecko da 429.
    vi.advanceTimersByTime(7 * 3600 * 1000);
    const rate = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    vi.stubGlobal("fetch", rate);
    const stale = await getMarketHighlights("BTC", "crypto");
    expect(stale?.high).toBe(73000); // servido del "último bueno", no falla
    vi.useRealTimers();
  });
});
