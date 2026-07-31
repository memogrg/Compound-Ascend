import { describe, it, expect } from "vitest";
import { aggregateHoldingsByNature } from "@/modules/wealth/engine/holding-nature";

describe("aggregateHoldingsByNature", () => {
  it("agrupa por naturaleza con valor y % sobre el total", () => {
    const r = aggregateHoldingsByNature([
      { nature: "growth", value: 6000 },
      { nature: "growth", value: 2000 },
      { nature: "cashflow", value: 2000 },
    ]);
    expect(r.growth).toEqual({ value: 8000, pct: 0.8 });
    expect(r.cashflow).toEqual({ value: 2000, pct: 0.2 });
    expect(r.sinClasificar).toEqual({ value: 0, pct: 0 });
    expect(r.total).toBe(10000);
  });

  it("holdings sin naturaleza caen en 'sinClasificar' (no se pierden)", () => {
    const r = aggregateHoldingsByNature([
      { nature: "cashflow", value: 500 },
      { nature: null, value: 500 },
    ]);
    expect(r.cashflow.value).toBe(500);
    expect(r.sinClasificar).toEqual({ value: 500, pct: 0.5 });
    expect(r.total).toBe(1000);
  });

  it("ignora valores ≤ 0 y no divide por cero", () => {
    expect(aggregateHoldingsByNature([])).toEqual({
      growth: { value: 0, pct: 0 },
      cashflow: { value: 0, pct: 0 },
      sinClasificar: { value: 0, pct: 0 },
      total: 0,
    });
    const r = aggregateHoldingsByNature([{ nature: "growth", value: -100 }]);
    expect(r.total).toBe(0);
  });
});
