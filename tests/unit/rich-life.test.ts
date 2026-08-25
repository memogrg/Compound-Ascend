import { describe, it, expect } from "vitest";
import {
  computeRichLifeIndicators,
  computeRichLifeScore,
  buildRichLifeSnapshot,
} from "@/modules/rich-life/engine/rich-life-engine";
import type { RichLifeInput, Asset, Liability } from "@/modules/rich-life/types";

const assets: Asset[] = [
  {
    id: "1",
    name: "Efectivo",
    assetClass: "liquido",
    value: 3000,
    currency: "CRC",
    generatesIncome: false,
  },
  {
    id: "2",
    name: "Alquiler",
    assetClass: "productivo",
    value: 7000,
    currency: "CRC",
    generatesIncome: true,
  },
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

  it("con la lista base vacía usa el compromiso mensual, igual que patrimonio-engine", () => {
    // Mismo caso real que el test del motor patrimonial: fondo de paz ₡18M como único
    // líquido, `expense_items` vacía y el gasto real (₡3,6M) en el compromiso. Antes,
    // /mi-rich-life mostraba 0 meses y 0% de cobertura y proponía "fortalece tu liquidez".
    const paz: Asset[] = [
      {
        id: "p",
        name: "Fondo de paz",
        assetClass: "liquido",
        value: 18_000_000,
        currency: "CRC",
        generatesIncome: false,
      },
    ];
    const ind = computeRichLifeIndicators(
      base({
        assets: paz,
        liabilities: [],
        monthlyExpenses: 0,
        monthlyCommitment: 3_600_000,
        passiveIncomeMonthly: 720_000,
      }),
    );
    expect(ind.monthsOfIndependence).toBe(5);
    expect(ind.passiveIncomeCoverage).toBeCloseTo(0.2);
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

/**
 * Delta 2 · item 3 — ratios que rompían su rango en los bordes (presentación, no dinero).
 * Los fixes son display/serialización: la identidad neto = activos − pasivos queda intacta.
 */
describe("delta 2 · bordes de ratios", () => {
  it("3a · sobregiro: liquidAssetsPct se clampa a 0, no negativo (y el neto no cambia)", () => {
    // Liquidez negativa (sobregiro) entra como activo `liquido` con value < 0.
    const conSobregiro: Asset[] = [
      {
        id: "liq",
        name: "Cuenta",
        assetClass: "liquido",
        value: -1000,
        currency: "CRC",
        generatesIncome: false,
      },
      {
        id: "prod",
        name: "Alquiler",
        assetClass: "productivo",
        value: 7000,
        currency: "CRC",
        generatesIncome: true,
      },
    ];
    const ind = computeRichLifeIndicators(base({ assets: conSobregiro, liabilities: [] }));
    expect(ind.liquidAssetsPct).toBe(0); // antes: -1000/6000 = -0.167 (bajo su rango 0-1)
    expect(ind.liquidAssetsPct).toBeGreaterThanOrEqual(0);
    // La identidad contable NO se toca: el sobregiro sigue restando del patrimonio.
    expect(ind.totalAssets).toBe(6000);
    expect(ind.netWorth).toBe(6000);
  });

  it("3b · sin deudas: assetLiabilityRatio es null (serializable), no Infinity", () => {
    const ind = computeRichLifeIndicators(base({ liabilities: [] }));
    expect(ind.assetLiabilityRatio).toBeNull();
    // Con deudas sí es un número (control).
    expect(computeRichLifeIndicators(base()).assetLiabilityRatio).toBe(5);
  });

  it("3c · sobreendeudado: debtToAssets supera 1 sin cap (pasivos > activos)", () => {
    const ind = computeRichLifeIndicators(
      base({
        assets: [
          {
            id: "a",
            name: "Efectivo",
            assetClass: "liquido",
            value: 1000,
            currency: "CRC",
            generatesIncome: false,
          },
        ],
        liabilities: [
          { id: "d", name: "Tarjeta", liabilityClass: "critico", balance: 3000, currency: "CRC" },
        ],
      }),
    );
    expect(ind.debtToAssets).toBeGreaterThan(1); // 3000/1000 = 3, legítimo (no se capea)
    expect(ind.netWorth).toBe(-2000); // identidad intacta
  });
});
