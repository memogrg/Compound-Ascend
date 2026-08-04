import { describe, it, expect } from "vitest";
import {
  selectPresupuesto,
  selectIngresos,
  selectGastos,
  selectAhorros,
  selectDeudas,
  selectInversiones,
  selectProteccion,
  selectPatrimonio,
  selectLibertad,
  deriveFundFlags,
  phaseLabel,
} from "@/modules/dashboard/engine/home-cards";
import type { MonthFlow } from "@/modules/financial-base";

const mf = (over: Partial<MonthFlow> = {}): MonthFlow => ({
  plan: { income: 3000, expense: 2500, free: 500 },
  real: { operatingIncome: 2800, operatingExpense: 2000, operatingFlow: 800 },
  capital: { in: 0, out: 0 },
  adherence: { spent: 2000, budget: 2500, pct: 0.8 },
  pending: { income: 0, expense: 0, count: 0 },
  currency: "CRC",
  ...over,
});

describe("selectPresupuesto", () => {
  it("usa el flujo operativo, calcula gap y % sin presupuesto, arma las barras", () => {
    const c = selectPresupuesto(
      mf(),
      { comida: { value: 1500 }, imprevisto: { value: 500 } }, // real
      { comida: { value: 1600 } }, // budget (imprevisto sin presupuesto)
    );
    expect(c.flujoReal).toBe(800);
    expect(c.flujoTone).toBe("pos");
    expect(c.gap).toBe(300); // real 800 − plan.free 500
    expect(c.pctSinPresupuesto).toBe(0.25); // 500 de 2000
    expect(c.barras).toEqual({
      ingreso: { plan: 3000, real: 2800 },
      gasto: { plan: 2500, real: 2000 },
    });
    expect(c.vsMes).toBeNull();
  });
});

describe("selectIngresos", () => {
  it("real operativo, % del plan y activo = activo + extraordinario", () => {
    const c = selectIngresos(mf(), { activo: 2000, pasivo: 500, extraordinario: 300 });
    expect(c.real).toBe(2800);
    expect(c.plan).toBe(3000);
    expect(c.pctDelPlan).toBe(round(2800 / 3000));
    expect(c.activo).toBe(2300); // 2000 + 300
    expect(c.pasivo).toBe(500);
  });
});

describe("selectGastos", () => {
  it("ranking de top sobres desc + % del plan + % sin presupuesto", () => {
    const real = {
      comida: { label: "Comida", value: 800 },
      ocio: { label: "Ocio", value: 1200 },
      otros: { label: "Otros", value: 0 }, // se ignora (0)
    };
    const c = selectGastos(mf(), real, { comida: { value: 900 } }, 4);
    expect(c.real).toBe(2000);
    expect(c.topSobres).toEqual([
      { label: "Ocio", value: 1200 },
      { label: "Comida", value: 800 },
    ]);
    expect(c.pctSinPresupuesto).toBe(0.6); // ocio 1200 sin budget / 2000
  });
});

describe("selectAhorros", () => {
  it("suma metas, medidor, aporte y rezagadas; ignora sobres (target 0)", () => {
    const c = selectAhorros([
      { id: "a", name: "Viaje", targetAmount: 1000, currentAmount: 800, monthlyContribution: 100 },
      { id: "b", name: "Carro", targetAmount: 1000, currentAmount: 100, monthlyContribution: 50 },
      { id: "s", name: "Sobre", targetAmount: 0, currentAmount: 0, monthlyContribution: 0 },
    ]);
    expect(c.ahorrado).toBe(900);
    expect(c.meta).toBe(2000);
    expect(c.falta).toBe(1100);
    expect(c.pct).toBe(0.45);
    expect(c.numMetas).toBe(2);
    expect(c.aporteMensual).toBe(150);
    expect(c.rezagadas[0]!.id).toBe("b"); // 10% primero
  });
});

describe("selectDeudas", () => {
  it("total, # y proyección de cierre factible con el método dado", () => {
    const c = selectDeudas(
      [
        { id: "1", name: "Tarjeta", balance: 1000, apr: 24, minPayment: 50 },
        { id: "2", name: "Auto", balance: 3000, apr: 12, minPayment: 100 },
      ],
      "avalancha",
      500, // extra
    );
    expect(c.total).toBe(4000);
    expect(c.numDeudas).toBe(2);
    expect(c.metodo).toBe("avalancha");
    expect(typeof c.mesesACierre).toBe("number");
    expect(c.mesesACierre!).toBeGreaterThan(0);
  });

  it("sin método → mesesACierre null; sin deudas → total 0", () => {
    expect(selectDeudas([], "avalancha", 0).total).toBe(0);
    expect(
      selectDeudas([{ id: "1", name: "x", balance: 100, apr: 10, minPayment: 5 }], null, 0)
        .mesesACierre,
    ).toBeNull();
  });
});

describe("selectInversiones", () => {
  it("P&L + tono + naturaleza (growth/cashflow) + # activos", () => {
    const analytics = {
      totalPortfolioValue: 12000,
      totalCostBasis: 10000,
      totalProfitLoss: 2000,
      totalReturnPct: 0.2,
      allocation: {} as never,
      holdingsWithPerformance: [] as never,
      growthScore: 70,
    };
    const c = selectInversiones(analytics, [
      { nature: "growth", value: 8000 },
      { nature: "cashflow", value: 4000 },
    ]);
    expect(c.valorActual).toBe(12000);
    expect(c.ganancia).toBe(2000);
    expect(c.gananciaTone).toBe("pos");
    expect(c.numActivos).toBe(2);
    expect(c.naturaleza.growth).toEqual({ value: 8000, pct: round(8000 / 12000) });
  });
});

describe("selectProteccion", () => {
  it("cobertura/prima + checklist de 5 + conteo de huecos", () => {
    const c = selectProteccion(
      {
        totalCoverage: 50000,
        activePolicies: 2,
        annualPremium: 1200,
        coverageByType: [{ type: "vehiculo", coverage: 15000 }],
      },
      { hasEmergencyFund: true, hasPeaceFund: false },
    );
    expect(c.cobertura).toBe(50000);
    expect(c.primaAnual).toBe(1200);
    expect(c.checklist).toHaveLength(5);
    // cubiertos: auto + fondo_emergencia; faltan vida, médico, fondo_paz → 3 huecos
    expect(c.huecos).toBe(3);
  });
});

describe("selectPatrimonio", () => {
  it("neto/activos/pasivos + productivo por % + veredicto = trend", () => {
    const c = selectPatrimonio({
      netWorth: 8000,
      totalAssets: 10000,
      totalLiabilities: 2000,
      productiveAssetsPct: 0.6,
      trend: "mas_rico",
    });
    expect(c.neto).toBe(8000);
    expect(c.activos).toBe(10000);
    expect(c.pasivos).toBe(2000);
    expect(c.veredicto).toBe("mas_rico");
    expect(c.productivos).toEqual({ value: 6000, pct: 0.6 });
    expect(c.noProductivos).toEqual({ value: 4000, pct: 0.4 });
  });
});

describe("selectLibertad", () => {
  it("fase (con label), % , falta y los 4 hitos con monto + %", () => {
    const c = selectLibertad({
      hitoAlcanzado: "seguridad",
      progresoSeguridad: 1,
      progresoIndependencia: 0.4,
      numeroDeSeguridad: 5_000_000,
      numeroDeIndependencia: 30_000_000,
      numeroDeLibertad: 50_000_000,
      progresoLibertad: 0.24,
      investableWealth: 12_000_000,
    });
    expect(c.fase).toBe("seguridad");
    expect(c.faseLabel).toBe("Seguridad");
    expect(c.pct).toBe(0.4);
    expect(c.falta).toBe(18_000_000); // 30M − 12M
    expect(c.metaLibertad).toBe(50_000_000);
    expect(c.actual).toBe(12_000_000); // valor actual = investableWealth
    expect(c.hitos.map((h) => h.label)).toEqual([
      "Punto de partida",
      "Seguridad",
      "Independencia",
      "Libertad",
    ]);
    expect(c.hitos[2]).toEqual({
      key: "independencia",
      label: "Independencia",
      amount: 30_000_000,
      pct: 0.4,
      state: "current",
    });
    // Estado por fase: alcanzado (verde) → en curso (ámbar) → pendiente (rojo).
    expect(c.hitos.map((h) => h.state)).toEqual(["done", "done", "current", "pending"]);
  });
});

describe("deriveFundFlags", () => {
  it("detecta fondos por goalType o por nombre, sólo si están fondeados (>0)", () => {
    expect(
      deriveFundFlags([
        { goalType: "defensa:fondo_emergencia", name: "X", currentAmount: 100 },
        { goalType: null, name: "Fondo de paz", currentAmount: 50 },
      ]),
    ).toEqual({ hasEmergencyFund: true, hasPeaceFund: true });
    // Registrado pero en 0 → no cuenta.
    expect(
      deriveFundFlags([{ goalType: "defensa:fondo_emergencia", name: "X", currentAmount: 0 }]),
    ).toEqual({ hasEmergencyFund: false, hasPeaceFund: false });
  });
});

describe("phaseLabel", () => {
  it("'ninguno' se muestra como 'Punto de partida'", () => {
    expect(phaseLabel("ninguno")).toBe("Punto de partida");
    expect(phaseLabel("libertad")).toBe("Libertad");
  });
});

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
