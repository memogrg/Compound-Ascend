import { describe, it, expect } from "vitest";
import { computeV2Totals, composition, topRows } from "@/modules/financial-base/engine/base-v2";
import { monthPeriod, previousMonthPeriod, parseMonthParam } from "@/modules/financial-base/engine/period";

describe("computeV2Totals", () => {
  it("calcula flujo libre, % y ratio", () => {
    const t = computeV2Totals({ budgetIncome: 1000, realIncome: 1200, budgetExpense: 800, realExpense: 600 });
    expect(t.freeCashflowReal).toBe(600);
    expect(t.freeCashflowPct).toBeCloseTo(0.5, 6);
    expect(t.expenseRatio).toBeCloseTo(0.5, 6);
    expect(t.incomeVariancePct).toBeCloseTo(0.2, 6);
    expect(t.expenseVariancePct).toBeCloseTo(-0.25, 6);
  });
  it("evita división por cero", () => {
    const t = computeV2Totals({ budgetIncome: 0, realIncome: 0, budgetExpense: 0, realExpense: 0 });
    expect(t.freeCashflowPct).toBe(0);
    expect(t.expenseRatio).toBe(0);
    expect(t.incomeVariancePct).toBe(0);
  });
});

describe("composition", () => {
  it("ordena desc. y reparte porcentajes", () => {
    const c = composition({
      a: { label: "A", value: 30 },
      b: { label: "B", value: 70 },
      z: { label: "Z", value: 0 },
    });
    expect(c.map((s) => s.key)).toEqual(["b", "a"]); // 0 se filtra
    expect(c[0]!.pct).toBeCloseTo(0.7, 6);
  });
});

describe("topRows", () => {
  it("une presupuesto y real por clave y marca sobre-gasto", () => {
    const rows = topRows(
      { vivienda: { label: "Vivienda", value: 300 } },
      { vivienda: { label: "Vivienda", value: 360 }, comida: { label: "Comida", value: 100 } },
      { kind: "expense" },
    );
    const vivienda = rows.find((r) => r.key === "vivienda")!;
    expect(vivienda.diff).toBe(60);
    expect(vivienda.status).toBe("over"); // 60/300 = 20% > 10%
    expect(rows[0]!.key).toBe("vivienda"); // mayor real primero
  });
  it("para ingresos, quedarse corto es alerta", () => {
    const rows = topRows(
      { salario: { label: "Salario", value: 1000 } },
      { salario: { label: "Salario", value: 800 } },
      { kind: "income" },
    );
    expect(rows[0]!.status).toBe("over"); // -20% < -10%
  });
});

describe("period", () => {
  it("monthPeriod arma rango inclusivo correcto", () => {
    const p = monthPeriod(2026, 2);
    expect(p.from).toBe("2026-02-01");
    expect(p.to).toBe("2026-02-28");
    expect(p.label).toBe("feb 2026");
  });
  it("previousMonthPeriod cruza año", () => {
    expect(previousMonthPeriod(monthPeriod(2026, 1)).label).toBe("dic 2025");
  });
  it("parseMonthParam usa el mes actual si el param es inválido", () => {
    const p = parseMonthParam("xx", new Date(2026, 5, 15)); // junio
    expect(p.month).toBe(6);
    expect(p.year).toBe(2026);
  });
});
