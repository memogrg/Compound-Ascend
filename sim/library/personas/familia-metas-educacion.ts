/**
 * Familia con metas de educación — dual/family income, high fixed expenses,
 * strong saving toward a large education fund, a mid-sized debt, no investment.
 * Exercises sustained goal contributions alongside heavy fixed spending.
 */
import { createPrng } from "../../prng";
import type { PersonaSpec } from "../persona-types";

export function buildFamiliaMetasEducacion(seed: number): PersonaSpec {
  const rng = createPrng(seed);
  const monthlyIncome = rng.amount(1_000_000, 1_250_000, 50_000);
  return {
    key: "familia-metas-educacion",
    displayName: "Familia con Metas de Educación",
    seed,
    demographics: { ageBand: "adulto", household: "familia", dependents: 2 },
    traits: {
      spendImpulsivity: 0.35,
      savingTendency: 0.75,
      riskAversion: 0.55,
      budgetCompliance: 0.7,
      emergencySensitivity: 0.4,
    },
    setup: {
      currencyAmountsLabel: "moneda única del run",
      openingBalance: rng.amount(350_000, 500_000, 50_000),
      monthlyIncome,
      incomeRegular: true,
      payDay: 5,
      fixedExpenseMonthly: rng.amount(420_000, 520_000, 20_000),
      hasDebt: true,
      debtBalance: rng.amount(250_000, 400_000, 50_000),
      debtMinPayment: rng.amount(12_000, 20_000, 2_000),
      hasGoal: true,
      goalTarget: rng.amount(700_000, 950_000, 50_000),
      hasInvestment: false,
      investmentValue: 0,
      incomeSourceName: "Salario familiar",
      expenseItemName: "Gastos del hogar",
      incomeBudgetName: "Salario mensual",
      expenseBudgetName: "Gastos familiares",
      debtName: "Préstamo personal",
      goalName: "Fondo de educación",
      holdingLabel: "",
    },
  };
}
