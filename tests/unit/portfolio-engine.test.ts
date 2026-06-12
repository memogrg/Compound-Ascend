import { describe, it, expect } from "vitest";
import {
  computeHoldingPerformance,
  computePortfolioAnalytics,
  computeGrowthScore,
  computeDividendAnalytics,
  computeCryptoAnalytics,
  buildConcentrationInsight,
  buildDiversificationInsight,
  buildDividendInsight,
  buildPassiveIncomeInsight,
  buildAllocationInsight,
  buildInvestmentInsights,
} from "@/modules/wealth/engine/portfolio-engine";
import type {
  Holding,
  Dividend,
  InvestmentReadiness,
  AssetType,
} from "@/modules/wealth/types";

// ── Helpers de datos mínimos ──────────────────────────────────────

let seq = 0;
function holding(p: Partial<Holding> & { symbol: string; assetType: AssetType }): Holding {
  return {
    id: `h${++seq}`,
    quantity: 1,
    averageCost: 100,
    currency: "USD",
    ...p,
  };
}

function readiness(state: InvestmentReadiness["state"]): InvestmentReadiness {
  return {
    score: 50,
    state,
    stateLabel: state,
    semaforo: "amarillo",
    message: "",
    checklist: [],
  };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function dividend(p: Partial<Dividend> & { amount: number; paymentDate: string }): Dividend {
  return {
    id: `d${++seq}`,
    holdingId: "h1",
    currency: "USD",
    ...p,
  };
}

// ── computeHoldingPerformance ─────────────────────────────────────

describe("computeHoldingPerformance", () => {
  it("con precio de mercado calcula valor, ganancia y retorno", () => {
    const h = holding({ symbol: "VOO", assetType: "etf", quantity: 2, averageCost: 100 });
    const perf = computeHoldingPerformance(h, 110);
    expect(perf.costBasis).toBe(200);
    expect(perf.currentValue).toBe(220);
    expect(perf.profitLoss).toBe(20);
    expect(perf.returnPct).toBeCloseTo(0.1);
    expect(perf.currentPrice).toBe(110);
  });

  it("con precio menor al costo registra pérdida y retorno negativo", () => {
    const h = holding({ symbol: "TSLA", assetType: "accion", quantity: 4, averageCost: 50 });
    const perf = computeHoldingPerformance(h, 40);
    expect(perf.costBasis).toBe(200);
    expect(perf.currentValue).toBe(160);
    expect(perf.profitLoss).toBe(-40);
    expect(perf.returnPct).toBeCloseTo(-0.2);
  });

  it("sin precio hace fallback al costo base (sin ganancia ni pérdida)", () => {
    const h = holding({ symbol: "AAPL", assetType: "accion", quantity: 3, averageCost: 50 });
    const perf = computeHoldingPerformance(h);
    expect(perf.currentValue).toBe(150);
    expect(perf.costBasis).toBe(150);
    expect(perf.profitLoss).toBe(0);
    expect(perf.returnPct).toBe(0);
    expect(perf.currentPrice).toBeUndefined();
  });

  it("sin precio pero con valor manual usa el valor manual", () => {
    const h = holding({
      symbol: "CASA",
      assetType: "inmueble",
      quantity: 1,
      averageCost: 80000,
      currentValueManual: 95000,
    });
    const perf = computeHoldingPerformance(h);
    expect(perf.currentValue).toBe(95000);
    expect(perf.profitLoss).toBe(15000);
    expect(perf.returnPct).toBeCloseTo(0.1875);
  });

  it("con costo base 0 el retorno es 0 (no divide por cero)", () => {
    const h = holding({ symbol: "GIFT", assetType: "accion", quantity: 5, averageCost: 0 });
    const perf = computeHoldingPerformance(h, 10);
    expect(perf.costBasis).toBe(0);
    expect(perf.currentValue).toBe(50);
    expect(perf.returnPct).toBe(0);
  });
});

// ── computePortfolioAnalytics ─────────────────────────────────────

describe("computePortfolioAnalytics", () => {
  const holdings = [
    holding({ symbol: "VOO", assetType: "etf", quantity: 2, averageCost: 100 }), // costo 200
    holding({ symbol: "AAPL", assetType: "accion", quantity: 3, averageCost: 50 }), // costo 150, sin precio
    holding({ symbol: "BTC", assetType: "cripto", quantity: 0.5, averageCost: 20000 }), // costo 10000
  ];
  const prices = { VOO: 110, BTC: 24000 };

  it("agrega buckets, costo total y ganancia con efectivo incluido", () => {
    const a = computePortfolioAnalytics(holdings, prices, 100);
    // etf 220 + stock 150 (fallback) + crypto 12000 + cash 100
    expect(a.totalPortfolioValue).toBe(12470);
    expect(a.totalCostBasis).toBe(10350);
    expect(a.totalProfitLoss).toBe(2020); // 12470 - 100 - 10350
    expect(a.totalReturnPct).toBeCloseTo(2020 / 10350);
    expect(a.allocation.etf.value).toBe(220);
    expect(a.allocation.stock.value).toBe(150);
    expect(a.allocation.crypto.value).toBe(12000);
    expect(a.allocation.cash.value).toBe(100);
    expect(a.allocation.other.value).toBe(0);
    expect(a.allocation.crypto.pct).toBeCloseTo(12000 / 12470);
    expect(a.allocation.etf.pct).toBeCloseTo(220 / 12470);
    expect(a.holdingsWithPerformance).toHaveLength(3);
  });

  it("busca el precio con el símbolo en mayúsculas", () => {
    const a = computePortfolioAnalytics(
      [holding({ symbol: "voo", assetType: "etf", quantity: 2, averageCost: 100 })],
      { VOO: 110 },
    );
    expect(a.holdingsWithPerformance[0]!.currentValue).toBe(220);
  });

  it("caso vacío: todo en cero y porcentajes sin división por cero", () => {
    const a = computePortfolioAnalytics([], {});
    expect(a.totalPortfolioValue).toBe(0);
    expect(a.totalCostBasis).toBe(0);
    expect(a.totalProfitLoss).toBe(0);
    expect(a.totalReturnPct).toBe(0);
    expect(a.allocation.etf.pct).toBe(0);
    expect(a.holdingsWithPerformance).toEqual([]);
  });

  it("solo efectivo: el portafolio vale el cash y el retorno es 0", () => {
    const a = computePortfolioAnalytics([], {}, 500);
    expect(a.totalPortfolioValue).toBe(500);
    expect(a.totalReturnPct).toBe(0);
    expect(a.allocation.cash.pct).toBe(1);
    expect(a.allocation.cash.label).toBe("Efectivo");
  });

  it("clasifica bono/fondo/pension como acciones y tipos raros como otros", () => {
    const a = computePortfolioAnalytics(
      [
        holding({ symbol: "BONO1", assetType: "bono", quantity: 1, averageCost: 100 }),
        holding({ symbol: "ARTE1", assetType: "arte", quantity: 1, averageCost: 300 }),
      ],
      {},
    );
    expect(a.allocation.stock.value).toBe(100);
    expect(a.allocation.other.value).toBe(300);
  });
});

// ── computeGrowthScore ────────────────────────────────────────────

describe("computeGrowthScore", () => {
  it("sin costo base el score es 0", () => {
    const a = computePortfolioAnalytics([], {}, 500);
    expect(computeGrowthScore(a, readiness("optimizar"))).toBe(0);
  });

  it("score máximo: 10%+ retorno, 4 buckets activos y readiness optimizar", () => {
    const hs = [
      holding({ symbol: "VOO", assetType: "etf", quantity: 1, averageCost: 100 }),
      holding({ symbol: "AAPL", assetType: "accion", quantity: 1, averageCost: 100 }),
      holding({ symbol: "BTC", assetType: "cripto", quantity: 1, averageCost: 100 }),
    ];
    const prices = { VOO: 110, AAPL: 110, BTC: 110 };
    const a = computePortfolioAnalytics(hs, prices, 50);
    // retorno = 30/300 = 10% → 30 pts; 4 buckets → 30 pts; optimizar → 40 pts
    expect(a.totalReturnPct).toBeCloseTo(0.1);
    expect(computeGrowthScore(a, readiness("optimizar"))).toBe(100);
  });

  it("score bajo: pérdida, un solo bucket y readiness no_listo", () => {
    const a = computePortfolioAnalytics(
      [holding({ symbol: "TSLA", assetType: "accion", quantity: 1, averageCost: 100 })],
      { TSLA: 80 },
    );
    // retorno -20% → 0 pts; 1 bucket → 30×(1/4)=7.5; no_listo → 0 → round(7.5)=8
    expect(computeGrowthScore(a, readiness("no_listo"))).toBe(8);
  });

  it("score intermedio: 5% retorno, 2 buckets, readiness constante", () => {
    const hs = [
      holding({ symbol: "VOO", assetType: "etf", quantity: 1, averageCost: 100 }),
      holding({ symbol: "AAPL", assetType: "accion", quantity: 1, averageCost: 100 }),
    ];
    const a = computePortfolioAnalytics(hs, { VOO: 105, AAPL: 105 });
    // retorno 5% → 15 pts; 2 buckets → 15 pts; constante → 25 pts
    expect(computeGrowthScore(a, readiness("constante"))).toBe(55);
  });
});

// ── computeDividendAnalytics ──────────────────────────────────────

describe("computeDividendAnalytics", () => {
  it("suma solo los dividendos de los últimos 12 meses", () => {
    const dividends = [
      dividend({ amount: 70, paymentDate: isoDaysAgo(30) }),
      dividend({ amount: 50, paymentDate: isoDaysAgo(200) }),
      dividend({ amount: 999, paymentDate: isoDaysAgo(730) }), // fuera de ventana
    ];
    const a = computeDividendAnalytics(dividends, 2400, 1200);
    expect(a.annualDividends).toBe(120);
    expect(a.monthlyDividends).toBe(10);
    expect(a.dividendYield).toBeCloseTo(0.05); // 120 / 2400
    expect(a.yieldOnCost).toBeCloseTo(0.1); // 120 / 1200
  });

  it("sin dividendos todo es 0", () => {
    const a = computeDividendAnalytics([], 2400, 1200);
    expect(a.annualDividends).toBe(0);
    expect(a.monthlyDividends).toBe(0);
    expect(a.dividendYield).toBe(0);
    expect(a.yieldOnCost).toBe(0);
  });

  it("con portafolio y costo en 0 no divide por cero", () => {
    const a = computeDividendAnalytics([dividend({ amount: 12, paymentDate: isoDaysAgo(10) })], 0, 0);
    expect(a.annualDividends).toBe(12);
    expect(a.dividendYield).toBe(0);
    expect(a.yieldOnCost).toBe(0);
  });
});

// ── computeCryptoAnalytics ────────────────────────────────────────

describe("computeCryptoAnalytics", () => {
  it("solo considera holdings cripto e ignora el resto", () => {
    const hs = [
      holding({ symbol: "BTC", assetType: "cripto", quantity: 0.5, averageCost: 20000 }),
      holding({ symbol: "VOO", assetType: "etf", quantity: 100, averageCost: 100 }),
    ];
    const a = computeCryptoAnalytics(hs, { BTC: 24000, VOO: 110 }, 24000);
    expect(a.costBasis).toBe(10000);
    expect(a.currentValue).toBe(12000);
    expect(a.profitLoss).toBe(2000);
    expect(a.allocationPct).toBeCloseTo(0.5); // 12000 / 24000
  });

  it("cripto sin precio hace fallback al costo base", () => {
    const hs = [holding({ symbol: "DOGE", assetType: "cripto", quantity: 100, averageCost: 2 })];
    const a = computeCryptoAnalytics(hs, {}, 400);
    expect(a.currentValue).toBe(200);
    expect(a.profitLoss).toBe(0);
    expect(a.allocationPct).toBeCloseTo(0.5);
  });

  it("sin cripto ni portafolio devuelve ceros sin dividir por cero", () => {
    const a = computeCryptoAnalytics([], {}, 0);
    expect(a).toEqual({ currentValue: 0, costBasis: 0, profitLoss: 0, allocationPct: 0 });
  });
});

// ── Insights deterministas ────────────────────────────────────────

function analyticsFromCosts(costs: Partial<Record<AssetType, number>>, cash = 0) {
  const hs = Object.entries(costs).map(([assetType, amount]) =>
    holding({
      symbol: assetType.toUpperCase().slice(0, 6),
      assetType: assetType as AssetType,
      quantity: 1,
      averageCost: amount,
    }),
  );
  return computePortfolioAnalytics(hs, {}, cash);
}

describe("buildConcentrationInsight", () => {
  it("portafolio vacío pide agregar posiciones", () => {
    expect(buildConcentrationInsight(computePortfolioAnalytics([], {}))).toContain(
      "Agrega tus posiciones",
    );
  });

  it("≥70% en una clase es alta concentración", () => {
    const msg = buildConcentrationInsight(analyticsFromCosts({ cripto: 80, etf: 20 }));
    expect(msg).toContain("Alta concentración");
    expect(msg).toContain("Cripto");
    expect(msg).toContain("80%");
  });

  it("50-69% es concentración moderada", () => {
    const msg = buildConcentrationInsight(analyticsFromCosts({ etf: 60, accion: 40 }));
    expect(msg).toContain("Concentración moderada");
    expect(msg).toContain("ETFs");
    expect(msg).toContain("60%");
  });

  it("<50% es buena distribución", () => {
    const msg = buildConcentrationInsight(analyticsFromCosts({ etf: 40, accion: 35 }, 25));
    expect(msg).toContain("Buena distribución");
    expect(msg).toContain("40%");
  });
});

describe("buildDiversificationInsight", () => {
  it("sin posiciones", () => {
    expect(buildDiversificationInsight(computePortfolioAnalytics([], {}))).toBe(
      "Sin posiciones registradas aún.",
    );
  });

  it("una sola clase de activo", () => {
    const msg = buildDiversificationInsight(analyticsFromCosts({ etf: 100 }));
    expect(msg).toContain("una sola clase de activo");
    expect(msg).toContain("ETFs");
  });

  it("dos clases de activo", () => {
    const msg = buildDiversificationInsight(analyticsFromCosts({ etf: 50, cripto: 50 }));
    expect(msg).toContain("dos clases de activo");
    expect(msg).toContain("ETFs y Cripto");
  });

  it("tres clases de activo sugiere llegar a 4+", () => {
    const msg = buildDiversificationInsight(analyticsFromCosts({ etf: 50, accion: 30 }, 20));
    expect(msg).toContain("3 clases de activo");
    expect(msg).toContain("4+");
  });

  it("cuatro o más clases es diversificación sólida", () => {
    const msg = buildDiversificationInsight(
      analyticsFromCosts({ etf: 40, accion: 30, cripto: 20 }, 10),
    );
    expect(msg).toContain("Diversificación sólida");
    expect(msg).toContain("4 clases");
  });
});

describe("buildDividendInsight", () => {
  it("sin dividendos en 12 meses invita a registrarlos", () => {
    const msg = buildDividendInsight(
      { monthlyDividends: 0, annualDividends: 0, dividendYield: 0, yieldOnCost: 0 },
      "CRC",
    );
    expect(msg).toContain("No registras dividendos");
  });

  it("con dividendos reporta yield y yield on cost con 2 decimales", () => {
    const msg = buildDividendInsight(
      { monthlyDividends: 10, annualDividends: 120, dividendYield: 0.05, yieldOnCost: 0.1 },
      "USD",
    );
    expect(msg).toContain("5.00%");
    expect(msg).toContain("10.00%");
    expect(msg).toContain("USD");
  });
});

describe("buildPassiveIncomeInsight", () => {
  it("sin dividendos mensuales", () => {
    expect(buildPassiveIncomeInsight(0, 1000, "CRC")).toContain("aún no generan ingreso pasivo");
  });

  it("sin gastos registrados pide agregarlos", () => {
    const msg = buildPassiveIncomeInsight(150, 0, "CRC");
    expect(msg).toContain("CRC 150");
    expect(msg).toContain("Agrega tus gastos");
  });

  it("cobertura parcial reporta el porcentaje", () => {
    const msg = buildPassiveIncomeInsight(250, 1000, "USD");
    expect(msg).toContain("25%");
    expect(msg).toContain("Llegar al 100%");
  });

  it("cobertura total (≥100%) es independencia financiera parcial", () => {
    const msg = buildPassiveIncomeInsight(1200, 1000, "USD");
    expect(msg).toContain("120%");
    expect(msg).toContain("independencia financiera parcial");
  });
});

describe("buildAllocationInsight", () => {
  it("sin perfil de riesgo pide definirlo", () => {
    const msg = buildAllocationInsight(analyticsFromCosts({ etf: 100 }), null);
    expect(msg).toContain("Define tu perfil de riesgo");
  });

  it("portafolio vacío también pide definir el perfil", () => {
    const msg = buildAllocationInsight(computePortfolioAnalytics([], {}), "moderado");
    expect(msg).toContain("Define tu perfil de riesgo");
  });

  it("alta exposición a cripto se marca como desalineación", () => {
    const msg = buildAllocationInsight(analyticsFromCosts({ etf: 60, cripto: 40 }), "moderado");
    expect(msg).toContain("perfil moderado");
    expect(msg).toContain("alta exposición a cripto (40%)");
    expect(msg).toContain("puede no alinearse");
  });

  it("concentración >70% en ETFs se marca", () => {
    const msg = buildAllocationInsight(analyticsFromCosts({ etf: 80, cripto: 20 }), "balanceado");
    expect(msg).toContain("concentración en ETFs (80%)");
  });

  it("concentración >70% en acciones se marca", () => {
    const msg = buildAllocationInsight(analyticsFromCosts({ accion: 80, etf: 20 }), "crecimiento");
    expect(msg).toContain("concentración en acciones (80%)");
  });

  it("asignación equilibrada es consistente con el perfil", () => {
    const msg = buildAllocationInsight(
      analyticsFromCosts({ etf: 50, accion: 30 }, 20),
      "balanceado",
    );
    expect(msg).toContain("consistente con tu perfil");
  });

  it("perfil desconocido usa la sugerencia genérica", () => {
    const msg = buildAllocationInsight(analyticsFromCosts({ etf: 50, accion: 50 }), "exotico");
    expect(msg).toContain("un portafolio acorde a tu tolerancia al riesgo");
  });
});

describe("buildInvestmentInsights", () => {
  it("arma los 5 insights coherentes con los builders individuales", () => {
    const analytics = analyticsFromCosts({ etf: 60, cripto: 40 });
    const divs = { monthlyDividends: 10, annualDividends: 120, dividendYield: 0.05, yieldOnCost: 0.1 };
    const insights = buildInvestmentInsights(analytics, divs, "moderado", 1000, "USD");
    expect(insights.concentrationAnalysis).toBe(buildConcentrationInsight(analytics));
    expect(insights.diversificationAnalysis).toBe(buildDiversificationInsight(analytics));
    expect(insights.dividendInsights).toBe(buildDividendInsight(divs, "USD"));
    expect(insights.passiveIncomeInsights).toBe(buildPassiveIncomeInsight(10, 1000, "USD"));
    expect(insights.allocationInsights).toBe(buildAllocationInsight(analytics, "moderado"));
  });
});
