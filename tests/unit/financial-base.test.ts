import { describe, it, expect } from "vitest";
import { monthlyize } from "@/modules/financial-base/engine/monthlyize";
import { computeBaseIndicators } from "@/modules/financial-base/engine/base-engine";
import type { IncomeSource, ExpenseItem } from "@/modules/financial-base/types";

describe("monthlyize", () => {
  it("mensual = sin cambio", () => {
    expect(monthlyize(1000, "mensual")).toBe(1000);
  });
  it("anual se divide entre 12", () => {
    expect(monthlyize(1200, "anual")).toBe(100);
  });
  it("único no aporta al mensual recurrente", () => {
    expect(monthlyize(5000, "unico")).toBe(0);
  });
  it("semestral se divide entre 6", () => {
    expect(monthlyize(600, "semestral")).toBe(100);
  });
});

function income(p: Partial<IncomeSource>): IncomeSource {
  return {
    id: "i",
    name: "x",
    incomeType: "activo",
    amount: 0,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    includeInBudget: true,
    amountMonthly: 0,
    ...p,
  };
}
function expense(p: Partial<ExpenseItem>): ExpenseItem {
  return {
    id: "e",
    name: "x",
    nature: "esencial",
    amount: 0,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    amountMonthly: 0,
    ...p,
  };
}

describe("computeBaseIndicators", () => {
  it("calcula flujo libre y tasas", () => {
    const incomes = [income({ amountMonthly: 1000, incomeType: "activo" })];
    const expenses = [
      expense({ nature: "esencial", amountMonthly: 400 }),
      expense({ nature: "inversion", amountMonthly: 100 }),
      expense({ nature: "financiero", amountMonthly: 200 }),
    ];
    const ind = computeBaseIndicators(incomes, expenses);
    expect(ind.incomeMonthly).toBe(1000);
    expect(ind.expenseMonthly).toBe(700);
    expect(ind.freeCashflow).toBe(300);
    expect(ind.investmentRate).toBe(0.1);
    expect(ind.debtWeight).toBe(0.2);
    expect(ind.essentialsWeight).toBe(0.4);
  });

  it("marca presión crítica con flujo negativo", () => {
    const ind = computeBaseIndicators(
      [income({ amountMonthly: 500 })],
      [expense({ amountMonthly: 800 })],
    );
    expect(ind.freeCashflow).toBe(-300);
    expect(ind.financialPressure).toBe("critica");
  });

  it("ignora ingresos excluidos del presupuesto", () => {
    const ind = computeBaseIndicators(
      [income({ amountMonthly: 1000, includeInBudget: false })],
      [],
    );
    expect(ind.incomeMonthly).toBe(0);
  });
});
