import { describe, it, expect } from "vitest";
import {
  isCurrentMonth,
  buildMonthMarker,
  nextMonthPeriod,
  previousMonthPeriod,
  monthPeriod,
} from "@/modules/financial-base/engine/period";

// #104 · el navegador de mes usa next/previousMonthPeriod para moverse; deben manejar el salto de año
// y ser inversos exactos (ida y vuelta = mismo período).
describe("nextMonthPeriod (#104)", () => {
  it("mes normal → mes+1 mismo año, con from/to/label coherentes", () => {
    const p = nextMonthPeriod(monthPeriod(2026, 7));
    expect({ year: p.year, month: p.month }).toEqual({ year: 2026, month: 8 });
    expect(p.from).toBe("2026-08-01");
    expect(p.to).toBe("2026-08-31");
    expect(p.label).toBe("ago 2026");
  });

  it("diciembre → enero del año SIGUIENTE", () => {
    const p = nextMonthPeriod(monthPeriod(2026, 12));
    expect({ year: p.year, month: p.month }).toEqual({ year: 2027, month: 1 });
  });

  it("enero (previousMonthPeriod) → diciembre del año ANTERIOR", () => {
    const p = previousMonthPeriod(monthPeriod(2026, 1));
    expect({ year: p.year, month: p.month }).toEqual({ year: 2025, month: 12 });
  });

  it("next∘previous = identidad (ida y vuelta), incluido el borde de año", () => {
    for (const [y, m] of [
      [2026, 7],
      [2026, 1],
      [2026, 12],
    ] as const) {
      const base = monthPeriod(y, m);
      const roundTrip = previousMonthPeriod(nextMonthPeriod(base));
      expect({ year: roundTrip.year, month: roundTrip.month }).toEqual({ year: y, month: m });
    }
  });
});

describe("isCurrentMonth", () => {
  it("mismo año-mes que hoy → true", () => {
    expect(isCurrentMonth({ year: 2026, month: 7 }, "2026-07-15")).toBe(true);
    // El día no importa: cualquier día de julio cuenta como el mes en curso.
    expect(isCurrentMonth({ year: 2026, month: 7 }, "2026-07-01")).toBe(true);
    expect(isCurrentMonth({ year: 2026, month: 7 }, "2026-07-31")).toBe(true);
  });

  it("mes pasado → false", () => {
    expect(isCurrentMonth({ year: 2026, month: 6 }, "2026-07-15")).toBe(false);
  });

  it("mismo mes pero otro año → false", () => {
    expect(isCurrentMonth({ year: 2025, month: 7 }, "2026-07-15")).toBe(false);
  });

  it("fin de diciembre vs enero siguiente → false (no cruza el año)", () => {
    expect(isCurrentMonth({ year: 2025, month: 12 }, "2026-01-01")).toBe(false);
  });
});

describe("buildMonthMarker", () => {
  it("mes en curso → título 'en curso', label 'liquidez hoy'", () => {
    const m = buildMonthMarker({
      period: { year: 2026, month: 7 },
      flow: 1500,
      liquidity: 8200,
      todayIso: "2026-07-15",
    });
    expect(m).toEqual({
      isCurrent: true,
      title: "Julio en curso",
      flow: 1500,
      liquidity: 8200,
      liquidityLabel: "liquidez hoy",
    });
  });

  it("mes cerrado → título 'Cierre de [mes] [año]', label 'liquidez al cierre'", () => {
    const m = buildMonthMarker({
      period: { year: 2026, month: 6 },
      flow: -320,
      liquidity: 6700,
      todayIso: "2026-07-15",
    });
    expect(m).toEqual({
      isCurrent: false,
      title: "Cierre de junio 2026",
      flow: -320,
      liquidity: 6700,
      liquidityLabel: "liquidez al cierre",
    });
  });

  it("preserva el signo del flujo (para colorear verde/rojo en la superficie)", () => {
    expect(
      buildMonthMarker({
        period: { year: 2026, month: 6 },
        flow: 0,
        liquidity: 1,
        todayIso: "2026-07-01",
      }).flow,
    ).toBe(0);
    expect(
      buildMonthMarker({
        period: { year: 2026, month: 6 },
        flow: -1,
        liquidity: 1,
        todayIso: "2026-07-01",
      }).flow,
    ).toBe(-1);
  });
});
