import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ COINGECKO_API_KEY: "cg", FINNHUB_TOKEN: "fh" }) }));

// Supabase service-role: captura los upserts al store + provee los símbolos objetivo.
const upserts: Record<string, unknown>[] = [];
const holdingsData = [
  { symbol: "BTC", asset_type: "cripto" },
  { symbol: "ETH", asset_type: "cripto" },
  { symbol: "VOO", asset_type: "etf" },
];
const alertsData = [{ symbol: "KMNO", asset_type: "cripto" }];
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: table === "investment_holdings" ? holdingsData : [] }),
        eq: () => ({ eq: () => Promise.resolve({ data: table === "price_alerts" ? alertsData : [] }) }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upserts.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  upserts.length = 0;
});

import { runCollection } from "@/lib/market-data/collector";

describe("runCollection · 1-2 llamadas batched → puebla el store con precio + ATH", () => {
  it("junta cripto (holdings+alertas) en UNA llamada /coins/markets y hace upsert de precio+ath", async () => {
    const cgCalls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.coingecko.com")) {
        cgCalls.push(url);
        if (url.includes("/coins/markets")) {
          return {
            ok: true,
            json: async () => [
              { id: "bitcoin", current_price: 63000, ath: 126000, ath_date: "2025-10-06T00:00:00Z", high_24h: 65000 },
              { id: "ethereum", current_price: 3000, ath: 4800, ath_date: "2021-11-10T00:00:00Z", high_24h: 3100 },
              { id: "kamino", current_price: 0.018, ath: 0.2478, ath_date: "2024-12-15T00:00:00Z", high_24h: 0.019 },
            ],
          };
        }
        return { ok: true, json: async () => ({ coins: [] }) }; // /search (no debería hacer falta: curados)
      }
      // Finnhub (VOO): quote + metric
      if (url.includes("/stock/metric")) return { ok: true, json: async () => ({ metric: { "52WeekHigh": 560, "52WeekHighDate": "2025-01-02" } }) };
      return { ok: true, json: async () => ({ c: 500 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await runCollection();

    // UNA sola llamada a /coins/markets para las 3 cripto (BTC/ETH/KMNO curados → sin /search).
    const marketsCalls = cgCalls.filter((u) => u.includes("/coins/markets"));
    expect(marketsCalls).toHaveLength(1);
    expect(marketsCalls[0]).toContain("bitcoin,ethereum,kamino");

    // Store: BTC con ATH real; asset_type = market type "crypto"; VOO con máx 52-sem.
    const btc = upserts.find((u) => u.symbol === "BTC")!;
    expect(btc.asset_type).toBe("crypto");
    expect(btc.price).toBe(63000);
    expect(btc.ath_usd).toBe(126000);
    expect(btc.high_kind).toBe("ath");
    const voo = upserts.find((u) => u.symbol === "VOO")!;
    expect(voo.asset_type).toBe("etf");
    expect(voo.ath_usd).toBe(560);
    expect(voo.high_kind).toBe("52w");

    expect(res.crypto).toBe(3);
    expect(res.written).toBe(4); // 3 cripto + VOO
  });

  it("INTEGRIDAD: precio 0/null NUNCA se guarda (no pisa el último bueno) — solo se upsertea lo válido", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.coingecko.com")) {
        if (url.includes("/coins/markets")) {
          return {
            ok: true,
            json: async () => [
              { id: "bitcoin", current_price: 63000, ath: 126000, ath_date: "2025-10-06T00:00:00Z", high_24h: 65000 },
              { id: "ethereum", current_price: null, ath: 4800, ath_date: "2021-11-10T00:00:00Z" }, // sin precio
              { id: "kamino", current_price: 0, ath: 0.2478, ath_date: "2024-12-15T00:00:00Z" }, // "$0" → basura
            ],
          };
        }
        return { ok: true, json: async () => ({ coins: [] }) };
      }
      // VOO válido
      if (url.includes("/stock/metric")) return { ok: true, json: async () => ({ metric: { "52WeekHigh": 560 } }) };
      return { ok: true, json: async () => ({ c: 500 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await runCollection();

    // Solo BTC (cripto válida) + VOO llegan al store. ETH (null) y KMNO (0) se DESCARTAN.
    const symbolsUpserted = upserts.map((u) => u.symbol).sort();
    expect(symbolsUpserted).toEqual(["BTC", "VOO"]);
    expect(upserts.find((u) => u.symbol === "KMNO")).toBeUndefined();
    expect(upserts.find((u) => u.symbol === "ETH")).toBeUndefined();
    expect(res.written).toBe(2);
  });

  it("INTEGRIDAD: ATH inválido se OMITE del payload (no pisa el ATH bueno previo con null)", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("api.coingecko.com")) {
        if (url.includes("/coins/markets")) {
          return {
            ok: true,
            json: async () => [
              { id: "bitcoin", current_price: 63000, ath: 0, ath_date: "2025-10-06T00:00:00Z" }, // precio ok, ATH 0
              { id: "ethereum", current_price: 3000, ath: 4800, ath_date: "2021-11-10T00:00:00Z" },
              { id: "kamino", current_price: 0.018, ath: 0.2478, ath_date: "2024-12-15T00:00:00Z" },
            ],
          };
        }
        return { ok: true, json: async () => ({ coins: [] }) };
      }
      if (url.includes("/stock/metric")) return { ok: true, json: async () => ({ metric: { "52WeekHigh": 560 } }) };
      return { ok: true, json: async () => ({ c: 500 }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await runCollection();

    const btc = upserts.find((u) => u.symbol === "BTC")!;
    expect(btc.price).toBe(63000); // el precio SÍ se guarda
    expect("ath_usd" in btc).toBe(false); // pero la clave ath NO va en el payload → conserva el previo
    const eth = upserts.find((u) => u.symbol === "ETH")!;
    expect(eth.ath_usd).toBe(4800); // ATH válido sí se escribe
  });
});
