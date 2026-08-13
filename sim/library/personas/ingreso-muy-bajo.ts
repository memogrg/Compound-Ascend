/**
 * Ingreso muy bajo — low income, tight budget, tiny emergency fund, small debt,
 * no investment. High emergency sensitivity → frequent shocks, partly covered by
 * pulling from the tiny goal (withdrawal). Moderate compliance keeps the minimum
 * debt payment going.
 */
import { createPrng } from "../../prng";
import type { PersonaSpec } from "../persona-types";

export function buildIngresoMuyBajo(seed: number): PersonaSpec {
  const rng = createPrng(seed);
  const monthlyIncome = rng.amount(220_000, 300_000, 20_000);
  return {
    key: "ingreso-muy-bajo",
    displayName: "Ingreso Muy Bajo",
    seed,
    demographics: { ageBand: "joven", household: "soltero", dependents: 0 },
    traits: {
      spendImpulsivity: 0.3,
      savingTendency: 0.3,
      riskAversion: 0.85,
      budgetCompliance: 0.6,
      emergencySensitivity: 0.85,
    },
    setup: {
      currencyAmountsLabel: "moneda única del run",
      openingBalance: rng.amount(20_000, 50_000, 10_000),
      monthlyIncome,
      incomeRegular: true,
      payDay: 2,
      fixedExpenseMonthly: rng.amount(120_000, 170_000, 10_000),
      hasDebt: true,
      debtBalance: rng.amount(90_000, 150_000, 10_000),
      debtMinPayment: rng.amount(6_000, 12_000, 2_000),
      hasGoal: true,
      goalTarget: rng.amount(40_000, 80_000, 10_000),
      hasInvestment: false,
      investmentValue: 0,
      incomeSourceName: "Salario",
      expenseItemName: "Alquiler",
      incomeBudgetName: "Salario mensual",
      expenseBudgetName: "Gastos básicos",
      debtName: "Deuda de tarjeta",
      goalName: "Fondo de emergencia",
      holdingLabel: "",
    },
  };
}
