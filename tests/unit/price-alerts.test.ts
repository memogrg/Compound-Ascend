import { describe, it, expect } from "vitest";
import {
  crossed,
  distinctSymbolFetches,
  selectTriggeredAlerts,
  priceKey,
} from "@/modules/wealth/engine/price-alerts";

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

describe("selectTriggeredAlerts · qué alertas dispara el cron", () => {
  const alert = (symbol: string, assetType: string, direction: "above" | "below", targetPrice: number) => ({
    id: `${symbol}-${direction}-${targetPrice}`,
    symbol,
    assetType,
    direction,
    targetPrice,
  });

  it("dispara la above y la below que cruzaron; deja las que no", () => {
    const alerts = [
      alert("BTC", "cripto", "above", 80000), // precio 81000 → dispara
      alert("BTC", "cripto", "above", 90000), // precio 81000 → NO
      alert("AAPL", "accion", "below", 200), // precio 195 → dispara
      alert("AAPL", "accion", "below", 180), // precio 195 → NO
    ];
    const prices = new Map([
      [priceKey("BTC", "cripto"), { price: 81000 }],
      [priceKey("AAPL", "accion"), { price: 195 }],
    ]);
    expect(selectTriggeredAlerts(alerts, prices).map((a) => a.id)).toEqual([
      "BTC-above-80000",
      "AAPL-below-200",
    ]);
  });

  it("un símbolo SIN precio no dispara y no rompe (best-effort)", () => {
    const alerts = [
      alert("BTC", "cripto", "above", 80000), // con precio → dispara
      alert("XXX", "accion", "above", 10), // sin precio → se salta
    ];
    const prices = new Map([[priceKey("BTC", "cripto"), { price: 81000 }]]);
    const out = selectTriggeredAlerts(alerts, prices);
    expect(out.map((a) => a.id)).toEqual(["BTC-above-80000"]);
  });

  it("solo recibe alertas activas → una one_shot ya disparada no está y no re-dispara", () => {
    // El cron pasa solo activas; simulamos que la ya-disparada no llega a la lista.
    const soloActivas = [alert("BTC", "cripto", "above", 80000)];
    const prices = new Map([[priceKey("BTC", "cripto"), { price: 81000 }]]);
    expect(selectTriggeredAlerts(soloActivas, prices)).toHaveLength(1);
    // Sin activas (la one_shot ya se desactivó) → nada dispara.
    expect(selectTriggeredAlerts([], prices)).toEqual([]);
  });
});
