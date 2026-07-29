import { describe, it, expect } from "vitest";
import {
  parseMultiScope,
  parsePriceModifier,
  isAltcoin,
  filterByScope,
  computeMultiScenario,
  buildMultiReply,
  type HoldingScenarioInput,
} from "@/lib/ai/market-scope";

describe("parseMultiScope · alcance múltiple", () => {
  it("altcoins / cripto / inversiones", () => {
    expect(parseMultiScope("vender todos los altcoins a 90% de su ATH")).toBe("altcoins");
    expect(parseMultiScope("cuánto vale toda mi cripto")).toBe("crypto");
    expect(parseMultiScope("si vendo todas mis inversiones al ATH")).toBe("all");
    expect(parseMultiScope("todas mis posiciones al máximo")).toBe("all");
  });
  it("una sola posición → null", () => {
    expect(parseMultiScope("si vendo KMNO al ATH")).toBeNull();
    expect(parseMultiScope("cuánto vale bitcoin")).toBeNull();
  });
});

describe("parsePriceModifier · modificador de precio", () => {
  it("% del ATH / ATH pleno / precio actual", () => {
    expect(parsePriceModifier("a 90% de su ATH")).toEqual({ kind: "pct_ath", pct: 90 });
    expect(parsePriceModifier("al 75% del máximo")).toEqual({ kind: "pct_ath", pct: 75 });
    expect(parsePriceModifier("al ATH")).toEqual({ kind: "ath" });
    expect(parsePriceModifier("al precio actual")).toEqual({ kind: "current" });
    expect(parsePriceModifier("cuánto generan")).toBeNull();
  });
});

describe("isAltcoin · cripto EXCEPTO BTC", () => {
  it("BTC no es altcoin; otras cripto sí; acciones/etf no", () => {
    expect(isAltcoin("cripto", "BTC")).toBe(false);
    expect(isAltcoin("cripto", "JUP")).toBe(true);
    expect(isAltcoin("cripto", "ETH")).toBe(true);
    expect(isAltcoin("etf", "VOO")).toBe(false);
  });
});

const HOLDINGS = [
  { symbol: "BTC", assetType: "cripto" },
  { symbol: "JUP", assetType: "cripto" },
  { symbol: "ETH", assetType: "cripto" },
  { symbol: "VOO", assetType: "etf" },
];

describe("filterByScope", () => {
  it("altcoins excluye BTC y no-cripto", () => {
    expect(filterByScope(HOLDINGS, "altcoins").map((h) => h.symbol)).toEqual(["JUP", "ETH"]);
  });
  it("crypto incluye BTC", () => {
    expect(filterByScope(HOLDINGS, "crypto").map((h) => h.symbol)).toEqual(["BTC", "JUP", "ETH"]);
  });
  it("all = cotizables (cripto+etf+accion)", () => {
    expect(filterByScope(HOLDINGS, "all").map((h) => h.symbol)).toEqual(["BTC", "JUP", "ETH", "VOO"]);
  });
});

describe("computeMultiScenario · por posición y suma (desglose por moneda)", () => {
  const rows: HoldingScenarioInput[] = [
    { symbol: "JUP", quantity: 1000, investedScen: 500, scenCurrency: "USD", high: 2, price: 0.5 },
    { symbol: "ETH", quantity: 2, investedScen: 3000, scenCurrency: "USD", high: 4800, price: 3000 },
  ];

  it("al 90% del ATH: valor = cantidad × (ATH×0.9); ganancia = valor − invertido; suma total", () => {
    const r = computeMultiScenario(rows, { kind: "pct_ath", pct: 90 });
    // JUP: 1000 × (2×0.9=1.8) = 1800, ganancia 1800−500 = 1300.
    const jup = r.perHolding.find((p) => p.symbol === "JUP")!;
    expect(jup.targetPrice).toBeCloseTo(1.8);
    expect(jup.value).toBe(1800);
    expect(jup.gain).toBe(1300);
    // ETH: 2 × (4800×0.9=4320) = 8640, ganancia 8640−3000 = 5640.
    const eth = r.perHolding.find((p) => p.symbol === "ETH")!;
    expect(eth.value).toBe(8640);
    expect(eth.gain).toBe(5640);
    // Total USD: 1800+8640 = 10440; ganancia 1300+5640 = 6940.
    expect(r.totalsByCurrency).toEqual([{ currency: "USD", value: 10440, gain: 6940, count: 2 }]);
    expect(r.missing).toEqual([]);
  });

  it("una posición SIN ATH no rompe el total: queda 'missing' y suma el resto", () => {
    const conFalta: HoldingScenarioInput[] = [
      ...rows,
      { symbol: "ZZZ", quantity: 10, investedScen: 100, scenCurrency: "USD", high: null, price: 5 },
    ];
    const r = computeMultiScenario(conFalta, { kind: "pct_ath", pct: 90 });
    expect(r.missing).toEqual(["ZZZ"]); // sin ATH y el modificador lo necesita
    expect(r.totalsByCurrency[0]!.count).toBe(2); // solo JUP + ETH suman
    expect(r.totalsByCurrency[0]!.value).toBe(10440);
  });

  it("modificador precio actual usa price (no necesita ATH)", () => {
    const soloPrecio: HoldingScenarioInput[] = [
      { symbol: "ZZZ", quantity: 10, investedScen: 100, scenCurrency: "USD", high: null, price: 5 },
    ];
    const r = computeMultiScenario(soloPrecio, { kind: "current" });
    expect(r.missing).toEqual([]);
    expect(r.perHolding[0]!.value).toBe(50); // 10 × 5
  });
});

describe("buildMultiReply · redacción + guardaraíl", () => {
  it("total, desglose y guardaraíl de escenario hipotético (no predicción)", () => {
    const r = computeMultiScenario(
      [
        { symbol: "JUP", quantity: 1000, investedScen: 500, scenCurrency: "USD", high: 2, price: 0.5 },
        { symbol: "ETH", quantity: 2, investedScen: 3000, scenCurrency: "USD", high: 4800, price: 3000 },
      ],
      { kind: "pct_ath", pct: 90 },
    );
    const reply = buildMultiReply(r, { kind: "pct_ath", pct: 90 }, "tus altcoins");
    expect(reply).toMatch(/90% de su ATH/);
    expect(reply).toMatch(/JUP/);
    expect(reply).toMatch(/ETH/);
    expect(reply).toMatch(/escenario a un precio hipotético/i);
    expect(reply).toMatch(/no una predicción|no se cronometra|el techo no/i);
  });

  it("todo missing → mensaje honesto de que faltó el dato", () => {
    const r = computeMultiScenario(
      [{ symbol: "ZZZ", quantity: 10, investedScen: 100, scenCurrency: "USD", high: null, price: null }],
      { kind: "pct_ath", pct: 90 },
    );
    const reply = buildMultiReply(r, { kind: "pct_ath", pct: 90 }, "tus altcoins");
    expect(reply).toMatch(/no pude calcular|falta/i);
  });
});
