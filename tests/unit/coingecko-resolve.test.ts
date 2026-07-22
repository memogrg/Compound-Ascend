import { describe, it, expect } from "vitest";
import { pickCoingeckoMatch, COINGECKO_IDS } from "@/lib/market-data/providers";

/**
 * Resolución de id de CoinGecko: la lista curada + el selector anti-colisión. Un id
 * equivocado mapea el ticker al precio de OTRA moneda (el bug que esto arregla).
 */
describe("COINGECKO_IDS · ids curados (verificados contra la API real)", () => {
  it("los 4 tickers del reporte resuelven a su id correcto", () => {
    expect(COINGECKO_IDS.ONDO).toBe("ondo-finance");
    expect(COINGECKO_IDS.KMNO).toBe("kamino");
    expect(COINGECKO_IDS.JUP).toBe("jupiter-exchange-solana");
    expect(COINGECKO_IDS.AERO).toBe("aerodrome-finance");
  });
});

describe("pickCoingeckoMatch · anti-colisión por market_cap_rank", () => {
  it("colisión de símbolo: elige el de mejor rank (Jupiter real, no el muerto)", () => {
    const coins = [
      { id: "jupiter", symbol: "JUP", market_cap_rank: 4424 }, // "Jupiter Project" muerto
      { id: "jupiter-exchange-solana", symbol: "JUP", market_cap_rank: 87 }, // el real
    ];
    expect(pickCoingeckoMatch(coins, "JUP")).toBe("jupiter-exchange-solana");
  });

  it("descarta los de market_cap_rank null (scam/muertos que reusan el símbolo)", () => {
    const coins = [
      { id: "scam-jup", symbol: "JUP", market_cap_rank: null },
      { id: "jupiter-exchange-solana", symbol: "JUP", market_cap_rank: 87 },
    ];
    expect(pickCoingeckoMatch(coins, "JUP")).toBe("jupiter-exchange-solana");
  });

  it("SOLO matches con rank null → null (no elige basura)", () => {
    const coins = [
      { id: "dead-1", symbol: "ONDO", market_cap_rank: null },
      { id: "dead-2", symbol: "ONDO", market_cap_rank: null },
    ];
    expect(pickCoingeckoMatch(coins, "ONDO")).toBeNull();
  });

  it("ignora coins cuyo símbolo NO coincide (evita el match por nombre)", () => {
    // /search?query=ONDO trae 'ondo-us-dollar-yield' (symbol USDY) — no debe elegirse.
    const coins = [{ id: "ondo-us-dollar-yield", symbol: "USDY", market_cap_rank: 40 }];
    expect(pickCoingeckoMatch(coins, "ONDO")).toBeNull();
  });

  it("sin coins → null", () => {
    expect(pickCoingeckoMatch([], "ONDO")).toBeNull();
  });
});
