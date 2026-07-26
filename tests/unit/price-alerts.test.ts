import { describe, it, expect } from "vitest";
import { crossed, distinctSymbolFetches } from "@/modules/wealth/engine/price-alerts";

describe("crossed · dispara al cruzar el objetivo", () => {
  it("above: dispara cuando el precio alcanza o supera el objetivo", () => {
    expect(crossed("above", 80000, 80000)).toBe(true); // exacto (a o por encima)
    expect(crossed("above", 80500, 80000)).toBe(true);
    expect(crossed("above", 79999, 80000)).toBe(false); // aún no cruzó
  });

  it("below: dispara cuando el precio alcanza o baja del objetivo", () => {
    expect(crossed("below", 50, 50)).toBe(true);
    expect(crossed("below", 48, 50)).toBe(true);
    expect(crossed("below", 51, 50)).toBe(false);
  });

  it("precio inválido (≤0 / NaN) nunca dispara", () => {
    expect(crossed("above", 0, 80000)).toBe(false);
    expect(crossed("above", -1, 80000)).toBe(false);
    expect(crossed("below", Number.NaN, 50)).toBe(false);
  });
});

describe("distinctSymbolFetches · un fetch por símbolo (dedup)", () => {
  it("colapsa alertas del mismo símbolo/tipo y normaliza a mayúsculas", () => {
    const alerts = [
      { symbol: "btc", assetType: "cripto" },
      { symbol: "BTC", assetType: "cripto" },
      { symbol: "AAPL", assetType: "accion" },
      { symbol: "AAPL", assetType: "accion" },
    ];
    expect(distinctSymbolFetches(alerts)).toEqual([
      { symbol: "BTC", assetType: "cripto" },
      { symbol: "AAPL", assetType: "accion" },
    ]);
  });

  it("mismo símbolo con tipos distintos → dos fetches", () => {
    const alerts = [
      { symbol: "X", assetType: "etf" },
      { symbol: "X", assetType: "accion" },
    ];
    expect(distinctSymbolFetches(alerts)).toHaveLength(2);
  });

  it("vacío → vacío", () => {
    expect(distinctSymbolFetches([])).toEqual([]);
  });
});
