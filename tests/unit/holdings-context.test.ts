import { describe, it, expect } from "vitest";
import { mapHoldingsForContext, type HoldingPerf, type MontoConverter } from "@/lib/ai/holdings-context";

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

// El motor entrega en CRC (moneda primaria); 1 USD = 500 CRC para que las cuentas sean legibles.
const CRC: { monedaPrimaria: string; convertir?: MontoConverter } = { monedaPrimaria: "CRC" };
const aUSD: MontoConverter = (monto, desde, hacia) =>
  desde === hacia ? monto : desde === "CRC" && hacia === "USD" ? monto / 500 : null;

describe("mapHoldingsForContext · el AI ve las posiciones con su costo de compra (cifras reales)", () => {
  it("mapea símbolo/cantidad/invertido/valor/precio/PL + agregados", () => {
    const out = mapHoldingsForContext([h({ currentValue: 560000 })], 500000, 60000, CRC)!;
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
    expect(out.investmentInvested).toEqual([{ monto: 500000, moneda: "CRC" }]);
    expect(out.investmentValue).toEqual([{ monto: 560000, moneda: "CRC" }]); // costo + P/L
    expect(out.investmentPL).toEqual([{ monto: 60000, moneda: "CRC" }]);
  });

  it("precio no disponible → price null (no se inventa el valor)", () => {
    const out = mapHoldingsForContext(
      [h({ currentValue: 500000, priceUnavailable: true, currentPrice: null })],
      500000,
      0,
      CRC,
    )!;
    expect(out.holdings[0]!.price).toBeNull();
    expect(out.holdings[0]!.priceUnavailable).toBe(true);
  });

  it("COMPACTO: ordena por valor desc y capa a max, reportando holdingsMoreCount", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      h({ symbol: `S${i}`, label: `S${i}`, currentValue: i * 1000 }),
    );
    const out = mapHoldingsForContext(many, 0, 0, { ...CRC, max: 12 })!;
    expect(out.holdings).toHaveLength(12);
    expect(out.holdings[0]!.symbol).toBe("S14"); // el de mayor valor primero
    expect(out.holdingsMoreCount).toBe(3);
  });

  it("sin posiciones → null (no agrega la sección)", () => {
    expect(mapHoldingsForContext([], 0, 0, CRC)).toBeNull();
  });
});

describe("mapHoldingsForContext · cada posición se lee en la moneda en que COTIZA", () => {
  it("cripto registrada en CRC → se reporta en USD, con los montos convertidos", () => {
    // El usuario la registró en colones, pero una cripto cotiza en dólares: la fila va en USD.
    const out = mapHoldingsForContext(
      [h({ assetType: "cripto", currency: "CRC", costBasis: 500_000, currentValue: 750_000, profitLoss: 250_000, currentPrice: 7500 })],
      500_000,
      250_000,
      { ...CRC, convertir: aUSD },
    )!;
    const row = out.holdings[0]!;
    expect(row.monedaFila).toBe("USD"); // dónde cotiza
    expect(row.currency).toBe("CRC"); // dónde la registró el usuario (son cosas distintas)
    expect(row.invested).toBe(1000);
    expect(row.value).toBe(1500);
    expect(row.pl).toBe(500);
    expect(row.price).toBe(15);
    // El valor comparable queda en la moneda del motor: es la base para porcentajes.
    expect(row.valorPrimario).toBe(750_000);
    expect(out.monedaPrimaria).toBe("CRC");
    expect(out.investmentValue).toEqual([{ monto: 1500, moneda: "USD" }]);
  });

  it("inmueble en CRC → se queda en CRC, sin conversión (no cotiza en mercado)", () => {
    const out = mapHoldingsForContext(
      [h({ symbol: null, label: "Casa", assetType: "inmueble", currency: "CRC", costBasis: 40_000_000, currentValue: 45_000_000, profitLoss: 5_000_000, currentPrice: null, priceUnavailable: true })],
      40_000_000,
      5_000_000,
      { ...CRC, convertir: aUSD },
    )!;
    const row = out.holdings[0]!;
    expect(row.monedaFila).toBe("CRC");
    expect(row.value).toBe(45_000_000); // intacto: no pasó por el conversor
    expect(out.investmentValue).toEqual([{ monto: 45_000_000, moneda: "CRC" }]);
  });

  it("conversor que devuelve null (sin tasas) → la fila se queda en primaria, BIEN etiquetada", () => {
    const sinTasas: MontoConverter = (monto, desde, hacia) => (desde === hacia ? monto : null);
    const out = mapHoldingsForContext(
      [h({ assetType: "cripto", currency: "CRC", currentValue: 750_000 })],
      500_000,
      250_000,
      { ...CRC, convertir: sinTasas },
    )!;
    const row = out.holdings[0]!;
    // Lo que NUNCA puede pasar: 750.000 colones rotulados como USD.
    expect(row.monedaFila).toBe("CRC");
    expect(row.value).toBe(750_000);
    expect(out.investmentValue).toEqual([{ monto: 750_000, moneda: "CRC" }]);
  });

  it("sin conversor inyectado tampoco se rotula mal: todo queda en primaria", () => {
    const out = mapHoldingsForContext([h({ currency: "CRC", currentValue: 560_000 })], 500_000, 60_000, CRC)!;
    expect(out.holdings[0]!.monedaFila).toBe("CRC");
  });

  it("portafolio MIXTO → agregados con un subtotal por moneda (nunca una suma cruzada)", () => {
    const out = mapHoldingsForContext(
      [
        h({ symbol: "BTC", assetType: "cripto", currency: "CRC", costBasis: 500_000, currentValue: 750_000, profitLoss: 250_000 }),
        h({ symbol: "VOO", assetType: "etf", currency: "USD", costBasis: 250_000, currentValue: 300_000, profitLoss: 50_000 }),
        h({ symbol: null, label: "Casa", assetType: "inmueble", currency: "CRC", costBasis: 40_000_000, currentValue: 45_000_000, profitLoss: 5_000_000, priceUnavailable: true, currentPrice: null }),
      ],
      40_750_000,
      5_300_000,
      { ...CRC, convertir: aUSD },
    )!;
    // Los dos cotizados suman en USD (1500 + 600); el inmueble queda aparte en CRC.
    expect(out.investmentValue).toEqual([
      { monto: 45_000_000, moneda: "CRC" },
      { monto: 2100, moneda: "USD" },
    ]);
    expect(out.investmentPL).toEqual([
      { monto: 5_000_000, moneda: "CRC" },
      { monto: 600, moneda: "USD" },
    ]);
    // El total del MOTOR sigue disponible en una sola moneda para calcular participaciones.
    expect(out.totalPrimario.valor).toEqual({ monto: 46_050_000, moneda: "CRC" });
  });

  it("los subtotales cubren TODAS las posiciones, aunque el detalle se recorte al top-N", () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      h({ symbol: `S${i}`, label: `S${i}`, currency: "USD", assetType: "otro", costBasis: 100, currentValue: 100, profitLoss: 0 }),
    );
    const out = mapHoldingsForContext(many, 1500, 0, { ...CRC, max: 12 })!;
    expect(out.holdings).toHaveLength(12);
    expect(out.investmentValue).toEqual([{ monto: 1500, moneda: "CRC" }]); // 15 × 100, no 12 × 100
  });
});
