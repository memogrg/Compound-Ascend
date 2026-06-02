import { describe, it, expect } from "vitest";
import {
  computeRichLifeIndicators,
  computeRichLifeScore,
  buildRichLifeSnapshot,
} from "@/modules/rich-life/engine/rich-life-engine";
import type { RichLifeInput, Asset, Liability } from "@/modules/rich-life/types";

const assets: Asset[] = [
  { id: "1", name: "Efectivo", assetClass: "liquido", value: 3000, currency: "CRC", generatesIncome: false },
  { id: "2", name: "Alquiler", assetClass: "productivo", value: 7000, currency: "CRC", generatesIncome: true },
];
const liabilities: Liability[] = [
  { id: "3", name: "Tarjeta", liabilityClass: "critico", balance: 2000, currency: "CRC" },
];

const base = (over: Partial<RichLifeInput> = {}): RichLifeInput => ({
  assets,
  liabilities,
  passiveIncomeMonthly: 500,
  monthlyExpenses: 1000,
  freeCashflow: 200,
  protectionScore: 60,
  diversification: "media",
  previous: null,
  currency: "CRC",
  ...over,
});

describe("computeRichLifeIndicators", () => {
  it("calcula patrimonio neto y ratios", () => {
    const ind = computeRichLifeIndicators(base());
    expect(ind.totalAssets).toBe(10000);
    expect(ind.totalLiabilities).toBe(2000);
    expect(ind.netWorth).toBe(8000);
    expect(ind.assetLiabilityRatio).toBe(5);
    expect(ind.productiveAssetsPct).toBeCloseTo(0.7);
    expect(ind.passiveIncomeCoverage).toBeCloseTo(0.5);
    expect(ind.trend).toBe("sin_historico");
  });

  it("detecta tendencia con histórico", () => {
    const richer = computeRichLifeIndicators(base({ previous: { netWorth: 7000 } }));
    expect(richer.trend).toBe("mas_rico");
    expect(richer.wealthVelocity).toBe(1000);

    const poorer = computeRichLifeIndicators(base({ previous: { netWorth: 9000 } }));
    expect(poorer.trend).toBe("mas_pobre");
  });
});

describe("computeRichLifeScore", () => {
  it("8 dimensiones, score 0-100", () => {
    const ind = computeRichLifeIndicators(base());
    const sc = computeRichLifeScore(ind, base());
    expect(sc.dims).toHaveLength(8);
    expect(sc.score).toBeGreaterThan(0);
    expect(sc.score).toBeLessThanOrEqual(100);
    expect(sc.state).toBeTruthy();
  });
});

describe("buildRichLifeSnapshot", () => {
  it("incluye lectura, acción y composición", () => {
    const snap = buildRichLifeSnapshot(base());
    expect(snap.reading).toContain("patrimonio neto");
    expect(snap.nextBestAction.length).toBeGreaterThan(10);
    expect(snap.assetsByClass.length).toBeGreaterThan(0);
  });
});
