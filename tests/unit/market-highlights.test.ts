import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Env con Finnhub token para la rama de acciones.
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ FINNHUB_TOKEN: "tok", ALPHA_VANTAGE_KEY: "" }),
}));

import { getMarketHighlights } from "@/lib/market-data";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
});
