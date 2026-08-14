/**
 * Sobreendeudado — over-indebted: big high-rate debt, thin buffer, high fixed
 * expenses. Low compliance/saving, high impulsivity → pays only the minimum on
 * debt, no goal, no investment, spends discretionarily, moderate emergencies.
 */
import { createPrng } from "../../prng";
import type { PersonaSpec } from "../persona-types";

export function buildSobreendeudado(seed: number): PersonaSpec {
  const rng = createPrng(seed);
  const monthlyIncome = rng.amount(550_000, 700_000, 50_000);
  return {
    key: "sobreendeudado",
    displayName: "Sobreendeudado",
    seed,
    demographics: { ageBand: "adulto", household: "soltero", dependents: 0 },
    traits: {
      spendImpulsivity: 0.8,
      savingTendency: 0.15,
      riskAversion: 0.7,
      budgetCompliance: 0.25,
      emergencySensitivity: 0.5,
    },
    setup: {
      currencyAmountsLabel: "moneda única del run",
      openingBalance: rng.amount(40_000, 120_000, 20_000),
      monthlyIncome,
      incomeRegular: true,
      payDay: 3,
      fixedExpenseMonthly: rng.amount(280_000, 360_000, 20_000),
      hasDebt: true,
      debtBalance: rng.amount(800_000, 1_100_000, 50_000),
      debtMinPayment: rng.amount(20_000, 30_000, 5_000),
      hasGoal: false,
      goalTarget: 0,
      hasInvestment: false,
      investmentValue: 0,
      incomeSourceName: "Salario",
      expenseItemName: "Renta",
      incomeBudgetName: "Salario mensual",
      expenseBudgetName: "Gastos del hogar",
      debtName: "Préstamo de consumo",
      goalName: "",
      holdingLabel: "",
    },
  };
}
