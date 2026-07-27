import { describe, it, expect } from "vitest";
import {
  crossed,
  distinctSymbolFetches,
  priceKey,
  timeHeldFires,
  vestingFires,
  alertFires,
  selectFiringAlerts,
  type EvaluableAlert,
  type AlertEvalContext,
} from "@/modules/wealth/engine/price-alerts";

const NOW = "2026-07-27T12:00:00.000Z";

/** Alerta evaluable con defaults nulos; solo se sobrescribe lo del kind bajo prueba. */
function A(over: Partial<EvaluableAlert> & { id: string }): EvaluableAlert & { id: string } {
  return {
    kind: "price",
    symbol: null,
    assetType: null,
    direction: null,
    targetPrice: null,
    holdingId: null,
    yearsThreshold: null,
    triggerDate: null,
    ...over,
  };
}

function ctx(over: Partial<AlertEvalContext> = {}): AlertEvalContext {
  return {
    nowIso: NOW,
    priceByKey: new Map(),
    purchaseDateByHolding: new Map(),
    ...over,
  };
}

describe("crossed · dispara al cruzar el objetivo", () => {
  it("above alcanza/supera; below alcanza/baja; ambos exactos disparan", () => {
    expect(crossed("above", 80000, 80000)).toBe(true);
    expect(crossed("above", 79999, 80000)).toBe(false);
    expect(crossed("below", 48, 50)).toBe(true);
    expect(crossed("below", 51, 50)).toBe(false);
  });
  it("precio inválido (≤0 / NaN) nunca dispara", () => {
    expect(crossed("above", 0, 80000)).toBe(false);
    expect(crossed("below", Number.NaN, 50)).toBe(false);
  });
});

describe("distinctSymbolFetches · un fetch por símbolo (dedup)", () => {
  it("colapsa mismo símbolo/tipo y normaliza a mayúsculas", () => {
    expect(
      distinctSymbolFetches([
        { symbol: "btc", assetType: "cripto" },
        { symbol: "BTC", assetType: "cripto" },
        { symbol: "AAPL", assetType: "accion" },
      ]),
    ).toEqual([
      { symbol: "BTC", assetType: "cripto" },
      { symbol: "AAPL", assetType: "accion" },
    ]);
  });
  it("mismo símbolo, tipos distintos → dos fetches; vacío → vacío", () => {
    expect(distinctSymbolFetches([{ symbol: "X", assetType: "etf" }, { symbol: "X", assetType: "accion" }])).toHaveLength(2);
    expect(distinctSymbolFetches([])).toEqual([]);
  });
});

describe("timeHeldFires · años invertido contra purchaseDate", () => {
  it("dispara cuando los años alcanzan el umbral", () => {
    // Comprado hace ~3 años → umbral 2 dispara, umbral 5 no.
    expect(timeHeldFires("2023-07-01", 2, NOW)).toBe(true);
    expect(timeHeldFires("2023-07-01", 5, NOW)).toBe(false);
  });
  it("sin purchaseDate o umbral inválido → no dispara", () => {
    expect(timeHeldFires(null, 2, NOW)).toBe(false);
    expect(timeHeldFires("2023-07-01", 0, NOW)).toBe(false);
  });
});

describe("vestingFires · fecha objetivo", () => {
  it("dispara cuando hoy alcanzó o pasó la fecha", () => {
    expect(vestingFires("2026-07-27", NOW)).toBe(true); // hoy
    expect(vestingFires("2026-07-26", NOW)).toBe(true); // pasada
    expect(vestingFires("2026-07-28", NOW)).toBe(false); // futura
    expect(vestingFires(null, NOW)).toBe(false);
  });
});

describe("alertFires / selectFiringAlerts · cada tipo con su condición", () => {
  const prices = new Map([[priceKey("BTC", "cripto"), { price: 81000 }]]);
  const purchase = new Map([["h1", "2023-07-01" as string | null]]);

  it("price: dispara solo con precio y cruce; sin precio no rompe", () => {
    const hit = A({ id: "p1", kind: "price", symbol: "BTC", assetType: "cripto", direction: "above", targetPrice: 80000 });
    const miss = A({ id: "p2", kind: "price", symbol: "BTC", assetType: "cripto", direction: "above", targetPrice: 90000 });
    const noPrice = A({ id: "p3", kind: "price", symbol: "XXX", assetType: "accion", direction: "above", targetPrice: 1 });
    expect(alertFires(hit, ctx({ priceByKey: prices }))).toBe(true);
    expect(alertFires(miss, ctx({ priceByKey: prices }))).toBe(false);
    expect(alertFires(noPrice, ctx({ priceByKey: prices }))).toBe(false);
  });

  it("time_held: usa la purchaseDate del holding", () => {
    const fire = A({ id: "t1", kind: "time_held", holdingId: "h1", yearsThreshold: 2 });
    const noFire = A({ id: "t2", kind: "time_held", holdingId: "h1", yearsThreshold: 10 });
    const noHolding = A({ id: "t3", kind: "time_held", holdingId: "hX", yearsThreshold: 1 });
    expect(alertFires(fire, ctx({ purchaseDateByHolding: purchase }))).toBe(true);
    expect(alertFires(noFire, ctx({ purchaseDateByHolding: purchase }))).toBe(false);
    expect(alertFires(noHolding, ctx({ purchaseDateByHolding: purchase }))).toBe(false);
  });

  it("vesting: usa la fecha de la alerta", () => {
    expect(alertFires(A({ id: "v1", kind: "vesting", triggerDate: "2026-07-27" }), ctx())).toBe(true);
    expect(alertFires(A({ id: "v2", kind: "vesting", triggerDate: "2026-12-31" }), ctx())).toBe(false);
  });

  it("selectFiringAlerts filtra mixto y sobre lista vacía (one_shot ya inactiva) no dispara nada", () => {
    const alerts = [
      A({ id: "p1", kind: "price", symbol: "BTC", assetType: "cripto", direction: "above", targetPrice: 80000 }),
      A({ id: "t1", kind: "time_held", holdingId: "h1", yearsThreshold: 2 }),
      A({ id: "v1", kind: "vesting", triggerDate: "2026-07-27" }),
      A({ id: "miss", kind: "price", symbol: "BTC", assetType: "cripto", direction: "above", targetPrice: 90000 }),
    ];
    const out = selectFiringAlerts(alerts, ctx({ priceByKey: prices, purchaseDateByHolding: purchase }));
    expect(out.map((a) => a.id)).toEqual(["p1", "t1", "v1"]);
    expect(selectFiringAlerts([], ctx({ priceByKey: prices }))).toEqual([]);
  });
});
