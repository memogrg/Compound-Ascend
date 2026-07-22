import { describe, it, expect } from "vitest";
import {
  compareSurplus,
  projectInvestment,
  investFutureValue,
  ASSET_HISTORY,
  SURPLUS_ASSETS,
  DEBT_INVEST_THRESHOLD,
} from "@/modules/wealth/engine/surplus-decision";
import { compareExtra, type AmortizationInput } from "@/modules/control/engine/amortization";

const PAY = { interestSaved: 8000, monthsSaved: 24 };

describe("surplus-decision · engine puro (F3)", () => {
  it("GATE: deuda > 12% → no se muestra inversión (pagá la deuda)", () => {
    const r = compareSurplus({ monthlySurplus: 300, horizonYears: 10, apr: 0.32, pay: PAY });
    expect(DEBT_INVEST_THRESHOLD).toBe(0.12);
    expect(r.gated).toBe(true);
    expect(r.invest).toEqual([]); // sin comparación de inversión
    expect(r.pay).toEqual(PAY); // pero sí el lado abonar
  });

  it("deuda ≤ 12% → SÍ se compara (abonar vs invertir)", () => {
    const r = compareSurplus({ monthlySurplus: 300, horizonYears: 10, apr: 0.08, pay: PAY });
    expect(r.gated).toBe(false);
    expect(r.invest).toHaveLength(3); // sp500, nasdaq, btc
    expect(r.pay).toEqual(PAY);
  });

  it("lado ABONAR usa el motor de amortización (interés ahorrado y meses adelantados)", () => {
    const mortgage: AmortizationInput = { balance: 50000, apr: 8, termMonths: 240 };
    const c = compareExtra(mortgage, 500, 15);
    expect(c.interestSaved).toBeGreaterThan(0); // certeza
    expect(c.monthsSaved).toBeGreaterThan(0);
  });

  it("lado INVERTIR: SIEMPRE 3 escenarios (peor/típico/mejor) + caída máxima; nunca una línea", () => {
    const r = compareSurplus({ monthlySurplus: 300, horizonYears: 10, apr: 0.08, pay: PAY });
    for (const p of r.invest) {
      expect(p.scenarios.map((s) => s.band)).toEqual(["peor", "tipico", "mejor"]);
      expect(p.maxDrawdown).toBeLessThan(0); // caída máxima visible
      // El mejor escenario rinde más que el peor (rango real, no una línea).
      expect(p.scenarios[2]!.endValue).toBeGreaterThan(p.scenarios[0]!.endValue);
    }
  });

  it("BTC: siempre con caveat fuerte y marcado como astilla (sliver); va último", () => {
    const r = compareSurplus({ monthlySurplus: 300, horizonYears: 10, apr: 0.08, pay: PAY });
    const btc = r.invest.find((p) => p.asset === "btc")!;
    expect(btc.sliver).toBe(true);
    expect(btc.caveat).toMatch(/perder la mayor parte|astilla|volatilidad/i);
    expect(SURPLUS_ASSETS[SURPLUS_ASSETS.length - 1]).toBe("btc");
  });

  it("investFutureValue: r=0 → aporte×meses; con retorno positivo compone por encima", () => {
    expect(investFutureValue(100, 0, 1)).toBe(1200); // 100 × 12
    expect(investFutureValue(100, 0.1, 10)).toBeGreaterThan(100 * 120); // compone > aportado
  });

  it("sin deuda → gated false, pay null, solo inversión", () => {
    const r = compareSurplus({ monthlySurplus: 200, horizonYears: 8, apr: null, pay: null });
    expect(r.gated).toBe(false);
    expect(r.pay).toBeNull();
    expect(r.invest).toHaveLength(3);
  });

  it("las constantes históricas incluyen caída máxima negativa y fuente por activo", () => {
    for (const a of SURPLUS_ASSETS) {
      expect(ASSET_HISTORY[a].maxDrawdown).toBeLessThan(0);
      expect(ASSET_HISTORY[a].source).toBeTruthy(); // citado
    }
    expect(projectInvestment(100, 5, "sp500").contributed).toBe(6000); // 100 × 60
  });
});
