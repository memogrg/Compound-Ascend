/**
 * Pure oracle math — FIXTURE data, NO DB, ungated (runs in `npm run sim`). Proves the
 * re-derivations, the verdict classification, and the report render headless. The real
 * oracle (against the test DB) is `oracle.test.ts` (gated), run via `npm run oracle`.
 */
import { describe, it, expect } from "vitest";
import {
  oracleLiquidity,
  oracleFlow,
  oracleSavingsRate,
  oracleDebtBalance,
  oraclePortfolio,
  oracleGoalSaved,
  oracleNetWorth,
  oracleBudgetAdherence,
  isFinancialNumber,
} from "./metrics";
import { compareIdentity, compareCharacterization, hasCritical } from "./compare";
import { renderMd, summarize } from "./report";
import { CENT_EPS, MONEY_EPS, RATIO_EPS } from "./tolerances";
import type { RawData, RawTxn } from "./types";

function raw(over: Partial<RawData> = {}): RawData {
  return {
    txns: [],
    ledger: [],
    incomes: [],
    expenses: [],
    budgetItems: [],
    debts: [],
    debtPayments: [],
    holdingContributions: [],
    investmentTxns: [],
    holdings: [],
    goals: [],
    ...over,
  };
}

const txn = (o: Partial<RawTxn>): RawTxn => ({
  kind: "gasto",
  amount: 0,
  occurred_on: "2026-01-10",
  linked_kind: "none",
  linked_id: null,
  counts_in_budget: true,
  category_id: null,
  status: "confirmed",
  ...o,
});

describe("oracle · metrics puras", () => {
  it("liquidez = Σ deltas del ledger", () => {
    const r = raw({ ledger: [{ delta: 1000, reason: "apertura" }, { delta: 500, reason: "ingreso" }, { delta: -200, reason: "gasto" }] });
    expect(oracleLiquidity(r)).toBe(1300);
  });

  it("flujo operativo excluye capital; freeCashflowReal lo incluye (zona 2)", () => {
    const PERIOD = { from: "2026-01-01", to: "2026-01-31" };
    const r = raw({
      txns: [
        txn({ kind: "ingreso", amount: 1000, linked_kind: "none" }),
        txn({ kind: "gasto", amount: 300, linked_kind: "none" }),
        txn({ kind: "gasto", amount: 200, linked_kind: "goal", linked_id: "g1" }), // capital-out
      ],
    });
    const f = oracleFlow(r, PERIOD);
    expect(f.operatingIncome).toBe(1000);
    expect(f.operatingExpense).toBe(300); // capital-out excluido
    expect(f.operatingFlow).toBe(700);
    expect(f.freeCashflowReal).toBe(500); // 1000 − (300 + 200 capital)
    // La diferencia entre ambos = el capital (zona 2).
    expect(f.operatingFlow - f.freeCashflowReal).toBe(200);
  });

  it("flujo SOLO cuenta el periodo reportado (regresión: sumaba todos los meses)", () => {
    const PERIOD = { from: "2026-02-01", to: "2026-02-28" };
    const r = raw({
      txns: [
        txn({ kind: "ingreso", amount: 800, occurred_on: "2026-01-05" }), // mes anterior → fuera
        txn({ kind: "gasto", amount: 300, occurred_on: "2026-01-10" }), // fuera
        txn({ kind: "ingreso", amount: 800, occurred_on: "2026-02-05" }), // dentro
        txn({ kind: "gasto", amount: 300, occurred_on: "2026-02-10" }), // dentro
      ],
    });
    const f = oracleFlow(r, PERIOD);
    // Solo febrero: 800 − 300 = 500 (NO 1600 − 600 = 1000 de sumar ambos meses).
    expect(f.operatingIncome).toBe(800);
    expect(f.operatingExpense).toBe(300);
    expect(f.operatingFlow).toBe(500);
  });

  it("tasa de ahorro: oracle (asignaciones) vs app (acredita sobrante) — zona 1", () => {
    const r = raw({
      incomes: [{ amount_monthly_base: 1000, include_in_budget: true }],
      expenses: [
        { amount_monthly_base: 400, nature: "esencial" },
        { amount_monthly_base: 100, nature: "ahorro" },
      ],
    });
    const s = oracleSavingsRate(r);
    expect(s.income).toBe(1000);
    expect(s.allocations).toBe(100); // solo el sobre ahorro
    expect(s.leftover).toBe(500); // 1000 − 500
    expect(s.oracleRate).toBe(0.1); // 100/1000
    expect(s.appRate).toBe(0.6); // (100 + 500)/1000
    expect(s.expectedModelDiff).toBe(0.5); // el sobrante acreditado como ahorro
  });

  it("deuda apr=0: saldo = original − Σ abonos (exacto)", () => {
    const r = raw({
      debts: [{ id: "d1", original_amount: 100000, balance: 100000, apr: 0, current_payment: 10000, min_payment: 10000 }],
      debtPayments: [
        { debt_id: "d1", occurred_on: "2026-01-05", amount: 10000, extra_amount: 0, kind: "ordinario" },
        { debt_id: "d1", occurred_on: "2026-02-05", amount: 10000, extra_amount: 0, kind: "ordinario" },
      ],
    });
    expect(oracleDebtBalance(r, "d1")).toBe(80000);
  });

  it("deuda apr>0 con 2 pagos el mismo mes: interés por días, no por pago (zona 3)", () => {
    const r = raw({
      debts: [{ id: "d1", original_amount: 100000, balance: 100000, apr: 12, current_payment: 10000, min_payment: 10000 }],
      debtPayments: [
        { debt_id: "d1", occurred_on: "2026-01-05", amount: 10000, extra_amount: 0, kind: "ordinario" },
        { debt_id: "d1", occurred_on: "2026-01-20", amount: 10000, extra_amount: 0, kind: "ordinario" }, // mismo mes
      ],
    });
    const bal = oracleDebtBalance(r, "d1");
    expect(isFinancialNumber(bal)).toBe(true);
    // Con interés acumula MÁS saldo que el caso apr=0 (80000)…
    expect(bal).toBeGreaterThan(80000);
    // …pero MENOS que si el 2º pago cobrara un mes entero de interés (día-a-día < mes).
    // 2º pago: 15 días vs ~30 → el interés del 2º paso es ~la mitad.
    expect(bal).toBeLessThan(82000);
  });

  it("deuda extraordinario: abono directo a principal, sin interés", () => {
    const r = raw({
      debts: [{ id: "d1", original_amount: 50000, balance: 50000, apr: 24, current_payment: 5000, min_payment: 5000 }],
      debtPayments: [{ debt_id: "d1", occurred_on: "2026-01-05", amount: 20000, extra_amount: 0, kind: "extraordinario" }],
    });
    expect(oracleDebtBalance(r, "d1")).toBe(30000); // 50000 − 20000, sin interés
  });

  it("portafolio event-sourced: qty/invested desde inicial + contribuciones (zona 8)", () => {
    const r = raw({
      holdingContributions: [
        { holding_id: "h1", amount: 300, unit_price: 150 },
        { holding_id: "h1", amount: 300, unit_price: 150 },
      ],
    });
    const p = oraclePortfolio(r, { VOO: 150 }, [{ holdingId: "h1", symbol: "VOO", quantity: 2, unitCost: 100 }]);
    expect(p.quantity).toBe(6); // 2 inicial + 2 + 2
    expect(p.invested).toBe(800); // 2×100 + 300 + 300
    expect(p.value).toBe(900); // 6 × 150
    expect(p.profitLoss).toBe(100);
    // El "trap": sumar los ledgers SOBRE el invested sobre-cuenta (demostración #655).
    expect(p.doubleCountTrap).toBeGreaterThan(p.invested);
  });

  it("portafolio: holding sin precio se excluye del valor (zona 6, lo maneja el caller)", () => {
    const r = raw({ holdingContributions: [{ holding_id: "h1", amount: 300, unit_price: 150 }] });
    const p = oraclePortfolio(r, {}, [{ holdingId: "h1", symbol: "VOO", quantity: 2, unitCost: 100 }]);
    expect(p.value).toBe(0); // sin precio → no valuado por el oracle
    expect(p.invested).toBe(0);
  });

  it("meta: saved = Σ linked 'goal' con signo (zona 5)", () => {
    const r = raw({
      txns: [
        txn({ kind: "gasto", amount: 500, linked_kind: "goal", linked_id: "g1" }), // aporte +
        txn({ kind: "gasto", amount: 100, linked_kind: "goal", linked_id: "g1", counts_in_budget: false }), // consumo −
        txn({ kind: "ingreso", amount: 50, linked_kind: "goal", linked_id: "g1" }), // retiro −
      ],
    });
    expect(oracleGoalSaved(r, "g1")).toBe(350); // 500 − 100 − 50
  });

  it("patrimonio: composición = liquidez + metas + inversiones − deudas", () => {
    const r = raw({
      ledger: [{ delta: 5000, reason: "apertura" }],
      goals: [{ id: "g1", current_amount: 999, target_amount: 2000 }],
      txns: [txn({ kind: "gasto", amount: 1000, linked_kind: "goal", linked_id: "g1" })],
      debts: [{ id: "d1", original_amount: 2000, balance: 2000, apr: 0, current_payment: 0, min_payment: 0 }],
    });
    const nw = oracleNetWorth(r, {}, []);
    expect(nw.liquidity).toBe(5000);
    expect(nw.goals).toBe(1000); // Σ linked, no el current_amount (999)
    expect(nw.portfolio).toBe(0);
    expect(nw.debts).toBe(2000);
    expect(nw.netWorth).toBe(4000); // 5000 + 1000 + 0 − 2000
  });

  it("presupuesto base-cero: remaining = budget − spent, finito (zona 7)", () => {
    const r = raw({
      budgetItems: [{ type: "expense", amount: 0, category_id: "c1", period_year: 2026, period_month: 1 }],
      txns: [txn({ kind: "gasto", amount: 300, category_id: "c1" })],
    });
    const adh = oracleBudgetAdherence(r, { year: 2026, month: 1 });
    const c1 = adh.find((e) => e.categoryId === "c1");
    expect(c1?.remaining).toBe(-300); // budget 0 − spent 300, sin Infinity/NaN
    expect(isFinancialNumber(c1?.remaining ?? NaN)).toBe(true);
  });
});

describe("oracle · comparador y veredictos", () => {
  it("identidad OK dentro de tolerancia", () => {
    const d = compareIdentity({ metric: "saco", persona: "x", oracle: 1000, app: 1000.5, tolerance: MONEY_EPS });
    expect(d.verdict).toBe("ok");
  });

  it("identidad ROTA fuera de tolerancia → crítico", () => {
    const d = compareIdentity({ metric: "composición", persona: "x", oracle: 1000, app: 1200, tolerance: MONEY_EPS });
    expect(d.verdict).toBe("critical");
    expect(hasCritical([d])).toBe(true);
  });

  it("valor no finito → crítico (sanidad)", () => {
    const d = compareIdentity({ metric: "neto", persona: "x", oracle: NaN, app: 1000, tolerance: MONEY_EPS });
    expect(d.verdict).toBe("critical");
    expect(d.severity).toBe("sanity");
  });

  it("caracterización: Δ = modelo conocido (no bug)", () => {
    const d = compareCharacterization({ metric: "tasa ahorro", persona: "x", oracle: 0.1, app: 0.6, tolerance: RATIO_EPS, expectedModelDiff: 0.5 });
    expect(d.verdict).toBe("characterization");
    expect(d.note).toContain("modelo conocido");
  });

  it("caracterización ratio: residual crudo cero NO marca posible bug (fix z1 redondeo)", () => {
    // z1: oracle 0, app 0.125, esperado 0.125 → residual crudo 0. Con round2(delta) daba
    // round2(0.125)=0.13 vs 0.125 = 0.01 > tol → falso "posible bug". Ahora usa el crudo.
    const d = compareCharacterization({ metric: "tasa ahorro", persona: "x", oracle: 0, app: 0.125, tolerance: RATIO_EPS, expectedModelDiff: 0.125 });
    expect(d.verdict).toBe("characterization");
    expect(d.note).toContain("modelo conocido");
    expect(d.note).not.toContain("posible bug");
  });

  it("caracterización: Δ > modelo → nota de posible bug (pero no bloquea)", () => {
    const d = compareCharacterization({ metric: "tasa ahorro", persona: "x", oracle: 0.1, app: 0.9, tolerance: RATIO_EPS, expectedModelDiff: 0.5 });
    expect(d.verdict).toBe("characterization");
    expect(d.note).toContain("posible bug");
    expect(hasCritical([d])).toBe(false);
  });

  it("caracterización sin modelo práctico: oracle vs app + Δ", () => {
    const d = compareCharacterization({ metric: "deuda", persona: "x", oracle: 81435, app: 82000, tolerance: CENT_EPS, expectedModelDiff: null });
    expect(d.verdict).toBe("characterization");
    expect(d.expectedModelDiff).toBeNull();
  });
});

describe("oracle · reporte", () => {
  it("renderiza la tabla, la Δ-modelo y la conclusión", () => {
    const ds = [
      compareIdentity({ metric: "saco", persona: "control", oracle: 1000, app: 1000, tolerance: MONEY_EPS }),
      compareCharacterization({ metric: "tasa ahorro", persona: "control", oracle: 0.1, app: 0.6, tolerance: RATIO_EPS, expectedModelDiff: 0.5 }),
    ];
    const md = renderMd(ds, { generatedAt: "2026-08-17T00:00:00Z" });
    expect(md).toContain("| Métrica | Persona | Oracle | App | Δ | Δ-modelo | Veredicto | Nota |");
    expect(md).toContain("## Conclusión");
    expect(md).toContain("Sin diferencias financieras críticas");
    expect(summarize(ds).critical).toBe(0);
  });

  it("con crítico: la conclusión lo marca bloqueante", () => {
    const ds = [compareIdentity({ metric: "composición", persona: "x", oracle: 1000, app: 2000, tolerance: MONEY_EPS })];
    const md = renderMd(ds);
    expect(md).toContain("❌ Críticos (bloqueantes)");
    expect(summarize(ds).critical).toBe(1);
  });
});
