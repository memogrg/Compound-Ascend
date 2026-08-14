/**
 * Comprador de vivienda — disciplined saver building a down-payment fund: low
 * impulsivity, very high saving, medium risk, no debt, a large housing goal, no
 * investment. Exercises sustained contribution to a big goal.
 */
import { createPrng } from "../../prng";
import type { PersonaSpec } from "../persona-types";

export function buildCompradorVivienda(seed: number): PersonaSpec {
  const rng = createPrng(seed);
  const monthlyIncome = rng.amount(950_000, 1_150_000, 50_000);
  return {
    key: "comprador-vivienda",
    displayName: "Comprador de Vivienda",
    seed,
    demographics: { ageBand: "adulto", household: "pareja", dependents: 0 },
    traits: {
      spendImpulsivity: 0.2,
      savingTendency: 0.85,
      riskAversion: 0.5, // medio: no dispara inversión (regla 6 pide < 0.5)
      budgetCompliance: 0.85,
      emergencySensitivity: 0.3,
    },
    setup: {
      currencyAmountsLabel: "moneda única del run",
      openingBalance: rng.amount(500_000, 700_000, 50_000),
      monthlyIncome,
      incomeRegular: true,
      payDay: 3,
      fixedExpenseMonthly: rng.amount(260_000, 340_000, 20_000),
      hasDebt: false,
      debtBalance: 0,
      debtMinPayment: 0,
      hasGoal: true,
      goalTarget: rng.amount(1_800_000, 2_400_000, 100_000),
      hasInvestment: false,
      investmentValue: 0,
      incomeSourceName: "Salario",
      expenseItemName: "Alquiler",
      incomeBudgetName: "Salario mensual",
      expenseBudgetName: "Gastos del hogar",
      debtName: "",
      goalName: "Prima de vivienda",
      holdingLabel: "",
    },
  };
}
