import { describe, it, expect } from "vitest";
import { mapHoldingsForContext, type HoldingPerf } from "@/lib/ai/holdings-context";

const h = (over: Partial<HoldingPerf> & { currentValue: number }): HoldingPerf => ({
  symbol: "KMNO",
  label: "Kimbal",
  assetType: "cripto",
  quantity: 100,
  costBasis: 500000,
  currentPrice: 5600,
  profitLoss: 60000,
  returnPct: 0.12,
  currency: "USD",
  priceUnavailable: false,
  ...over,
});

describe("mapHoldingsForContext · el AI ve las posiciones con su costo de compra (cifras reales)", () => {
  it("mapea símbolo/cantidad/invertido/valor/precio/PL + agregados", () => {
    const out = mapHoldingsForContext([h({ currentValue: 560000 })], 500000, 60000)!;
    expect(out.holdings[0]).toMatchObject({
      symbol: "KMNO",
      name: "Kimbal",
      quantity: 100,
      invested: 500000,
      value: 560000,
      price: 5600,
      pl: 60000,
    });
    expect(out.holdings[0]!.assetType).toBe("cripto"); // para el carril de datos de mercado
    // Con esto una pregunta "si vendo KMNO, ¿cuánto gano vs lo invertido?" tiene el número real.
    expect(out.investmentInvested).toBe(500000);
    expect(out.investmentValue).toBe(560000); // costo + P/L
    expect(out.investmentPL).toBe(60000);
  });

  it("precio no disponible → price null (no se inventa el valor)", () => {
    const out = mapHoldingsForContext(
      [h({ currentValue: 500000, priceUnavailable: true, currentPrice: null })],
      500000,
      0,
    )!;
    expect(out.holdings[0]!.price).toBeNull();
    expect(out.holdings[0]!.priceUnavailable).toBe(true);
  });

  it("COMPACTO: ordena por valor desc y capa a max, reportando holdingsMoreCount", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      h({ symbol: `S${i}`, label: `S${i}`, currentValue: i * 1000 }),
    );
    const out = mapHoldingsForContext(many, 0, 0, 12)!;
    expect(out.holdings).toHaveLength(12);
    expect(out.holdings[0]!.symbol).toBe("S14"); // el de mayor valor primero
    expect(out.holdingsMoreCount).toBe(3);
  });

  it("sin posiciones → null (no agrega la sección)", () => {
    expect(mapHoldingsForContext([], 0, 0)).toBeNull();
  });
});
