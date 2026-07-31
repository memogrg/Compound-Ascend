import { describe, it, expect } from "vitest";
import {
  classifyTxnFlow,
  aggregateMonthFlow,
  type FlowClass,
  type MonthFlowRow,
} from "@/modules/financial-base/engine/month-flow";

type TxnLike = { id: string; kind: string; linkedKind?: string; countsInBudget?: boolean };
const c = (t: TxnLike, dividends: string[] = []) =>
  classifyTxnFlow(t as never, new Set(dividends));

describe("classifyTxnFlow · operativo vs capital", () => {
  const cases: Array<[string, TxnLike, string[], FlowClass]> = [
    ["Salario / ingreso normal", { id: "1", kind: "ingreso", linkedKind: "none" }, [], "operating_income"],
    ["Renta (ingreso/rental)", { id: "2", kind: "ingreso", linkedKind: "rental" }, [], "operating_income"],
    // Caso ambiguo resuelto por el ledger de dividendos:
    ["Dividendo (ingreso/holding, id ∈ dividends)", { id: "d1", kind: "ingreso", linkedKind: "holding" }, ["d1"], "operating_income"],
    ["Venta de inversión (ingreso/holding, id ∉ dividends)", { id: "v1", kind: "ingreso", linkedKind: "holding" }, ["d1"], "capital_in"],
    ["Retiro de meta (ingreso/goal)", { id: "3", kind: "ingreso", linkedKind: "goal" }, [], "capital_in"],
    ["Gasto de consumo (gasto/none)", { id: "4", kind: "gasto", linkedKind: "none", countsInBudget: true }, [], "operating_expense"],
    ["Pago de deuda (gasto/debt)", { id: "5", kind: "gasto", linkedKind: "debt", countsInBudget: true }, [], "operating_expense"],
    ["Prima de seguro (gasto/policy)", { id: "6", kind: "gasto", linkedKind: "policy", countsInBudget: true }, [], "operating_expense"],
    ["Compra de inversión (gasto/holding)", { id: "7", kind: "gasto", linkedKind: "holding", countsInBudget: true }, [], "capital_out"],
    ["Aporte a meta (gasto/goal, budget-aware)", { id: "8", kind: "gasto", linkedKind: "goal", countsInBudget: true }, [], "capital_out"],
    ["Consumo de frasco (gasto/goal, off-budget)", { id: "9", kind: "gasto", linkedKind: "goal", countsInBudget: false }, [], "excluded"],
    ["Transferencia", { id: "10", kind: "transferencia" }, [], "excluded"],
    ["Ajuste", { id: "11", kind: "ajuste" }, [], "excluded"],
  ];

  it.each(cases)("%s", (_desc, txn, dividends, expected) => {
    expect(c(txn, dividends)).toBe(expected);
  });

  it("dividendo y venta comparten linkedKind='holding'; sólo el ledger los separa", () => {
    const div = { id: "x", kind: "ingreso", linkedKind: "holding" };
    expect(c(div, ["x"])).toBe("operating_income"); // en el ledger → dividendo
    expect(c(div, [])).toBe("capital_in"); // no en el ledger → venta
  });

  it("consumo de frasco off-budget nunca cuenta, aunque esté vinculado a meta", () => {
    expect(c({ id: "y", kind: "gasto", linkedKind: "goal", countsInBudget: false })).toBe("excluded");
  });
});

describe("aggregateMonthFlow · titular confirmed-only, capital y pendientes aparte", () => {
  const row = (over: Partial<MonthFlowRow>): MonthFlowRow => ({
    flow: "operating_income",
    kind: "ingreso",
    value: 0,
    confirmed: true,
    countsInBudget: true,
    ...over,
  });

  it("real = ingreso operativo − gasto operativo (sólo confirmadas)", () => {
    const mf = aggregateMonthFlow({
      rows: [
        row({ flow: "operating_income", kind: "ingreso", value: 1000 }),
        row({ flow: "operating_expense", kind: "gasto", value: 300 }),
      ],
      plan: { income: 900, expense: 250 },
      budget: 500,
      currency: "CRC",
    });
    expect(mf.real).toEqual({ operatingIncome: 1000, operatingExpense: 300, operatingFlow: 700 });
    expect(mf.plan).toEqual({ income: 900, expense: 250, free: 650 });
  });

  it("los movimientos de capital NO entran en el flujo real; van en capital{in,out}", () => {
    const mf = aggregateMonthFlow({
      rows: [
        row({ flow: "operating_income", kind: "ingreso", value: 1000 }),
        row({ flow: "capital_in", kind: "ingreso", value: 12000 }), // venta de inversión
        row({ flow: "capital_out", kind: "gasto", value: 2000 }), // aporte a meta
      ],
      plan: { income: 900, expense: 250 },
      budget: 3000,
      currency: "CRC",
    });
    expect(mf.real.operatingIncome).toBe(1000); // NO incluye los 12000 de la venta
    expect(mf.real.operatingFlow).toBe(1000);
    expect(mf.capital).toEqual({ in: 12000, out: 2000 });
  });

  it("transferencias/ajustes (excluded) no inflan nada", () => {
    const mf = aggregateMonthFlow({
      rows: [
        row({ flow: "operating_expense", kind: "gasto", value: 300 }),
        row({ flow: "excluded", kind: "transferencia", value: 999999 }),
        row({ flow: "excluded", kind: "ajuste", value: 888888 }),
      ],
      plan: { income: 0, expense: 0 },
      budget: 400,
      currency: "CRC",
    });
    expect(mf.real.operatingExpense).toBe(300);
    expect(mf.real.operatingFlow).toBe(-300);
    expect(mf.capital).toEqual({ in: 0, out: 0 });
  });

  it("pendientes van a pending{income,expense,count}, fuera del titular", () => {
    const mf = aggregateMonthFlow({
      rows: [
        row({ flow: "operating_income", kind: "ingreso", value: 1000, confirmed: true }),
        row({ flow: "operating_income", kind: "ingreso", value: 500, confirmed: false }),
        row({ flow: "operating_expense", kind: "gasto", value: 200, confirmed: false }),
      ],
      plan: { income: 0, expense: 0 },
      budget: 0,
      currency: "CRC",
    });
    expect(mf.real.operatingIncome).toBe(1000); // sólo la confirmada
    expect(mf.pending).toEqual({ income: 500, expense: 200, count: 2 });
  });

  it("adherencia = gasto budget-aware (operativo + capital_out) confirmado / presupuesto total", () => {
    const mf = aggregateMonthFlow({
      rows: [
        row({ flow: "operating_expense", kind: "gasto", value: 300 }),
        row({ flow: "capital_out", kind: "gasto", value: 500 }), // aporte a meta: consume presupuesto
        row({ flow: "excluded", kind: "gasto", value: 999, countsInBudget: false }), // off-budget: no
      ],
      plan: { income: 0, expense: 0 },
      budget: 400,
      currency: "CRC",
    });
    expect(mf.adherence.spent).toBe(800); // 300 + 500
    expect(mf.adherence.budget).toBe(400);
    expect(mf.adherence.pct).toBe(2); // 800/400 = 197%→2.0
  });
});
