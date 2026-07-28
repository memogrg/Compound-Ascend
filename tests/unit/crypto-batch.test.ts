import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ COINGECKO_API_KEY: "cg-demo" }) }));
// persist es fire-and-forget (BD); no-op en test.
vi.mock("@/lib/market-data/persist", () => ({ persistMarketPrice: vi.fn() }));

import { getCryptoPricesBatch } from "@/lib/market-data";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getCryptoPricesBatch · UNA llamada para TODAS las cripto (no ráfaga)", () => {
  it("colapsa N símbolos curados en 1 request /simple/price?ids=comma y mapea por símbolo", async () => {
    const urls: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      urls.push(url);
      // /simple/price batch: keyed por id de CoinGecko.
      return {
        ok: true,
        json: async () => ({
          bitcoin: { usd: 60000, usd_24h_change: 1.2 },
          ethereum: { usd: 3000, usd_24h_change: -0.5 },
          kamino: { usd: 0.018, usd_24h_change: 2.1 },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await getCryptoPricesBatch(["BTC", "ETH", "KMNO"]);
    // UNA sola llamada HTTP (todos los ids curados → sin /search).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(urls[0]).toContain("/simple/price?ids=");
    expect(urls[0]).toContain("bitcoin,ethereum,kamino");
    // Mapea por SÍMBOLO en mayúsculas.
    expect(out.BTC?.price).toBe(60000);
    expect(out.ETH?.price).toBe(3000);
    expect(out.KMNO?.price).toBe(0.018);
    expect(out.KMNO?.provider).toBe("coingecko");
  });

  it("2ª llamada al mismo set → cache hit (0 fetch nuevos → sin ráfaga ni timeout)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ solana: { usd: 150 } }) }));
    vi.stubGlobal("fetch", fetchMock);

    await getCryptoPricesBatch(["SOL"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    const second = await getCryptoPricesBatch(["SOL"]);
    expect(second.SOL?.price).toBe(150);
    expect(fetchMock).not.toHaveBeenCalled(); // servido de caché
  });

  it("single-flight: dos batches concurrentes del mismo set comparten UNA llamada", async () => {
    let openGate: (v: unknown) => void = () => {};
    const gate = new Promise((r) => (openGate = r));
    const fetchMock = vi.fn(async () => {
      await gate;
      return { ok: true, json: async () => ({ ripple: { usd: 0.6 } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    const p1 = getCryptoPricesBatch(["XRP"]);
    const p2 = getCryptoPricesBatch(["XRP"]); // concurrente, mismo set
    openGate(null);
    const [a, b] = await Promise.all([p1, p2]);
    expect(a.XRP?.price).toBe(0.6);
    expect(b.XRP?.price).toBe(0.6);
    expect(fetchMock).toHaveBeenCalledTimes(1); // coalescido
  });
});
