/**
 * Inversionista activo — low risk-aversion, high saving, no debt: contributes to
 * a NON-quoted holding every month (investmentBuy) plus a modest goal. Exercises
 * the investment route. Holding stays non-quoted for determinism (quoted + DCA is
 * F3).
 */
import { createPrng } from "../../prng";
import type { PersonaSpec } from "../persona-types";

export function buildInversionistaActivo(seed: number): PersonaSpec {
  const rng = createPrng(seed);
  const monthlyIncome = rng.amount(1_100_000, 1_350_000, 50_000);
  return {
    key: "inversionista-activo",
    displayName: "Inversionista Activo",
    seed,
    demographics: { ageBand: "adulto", household: "soltero", dependents: 0 },
    traits: {
      spendImpulsivity: 0.3,
      savingTendency: 0.8,
      riskAversion: 0.2, // baja → dispara investmentBuy mensual (regla 6)
      budgetCompliance: 0.8,
      emergencySensitivity: 0.25,
    },
    setup: {
      currencyAmountsLabel: "moneda única del run",
      openingBalance: rng.amount(600_000, 850_000, 50_000),
      monthlyIncome,
      incomeRegular: true,
      payDay: 4,
      fixedExpenseMonthly: rng.amount(260_000, 340_000, 20_000),
      hasDebt: false,
      debtBalance: 0,
      debtMinPayment: 0,
      hasGoal: true,
      goalTarget: rng.amount(150_000, 250_000, 50_000),
      hasInvestment: true,
      investmentValue: rng.amount(450_000, 650_000, 50_000),
      incomeSourceName: "Salario",
      expenseItemName: "Renta",
      incomeBudgetName: "Salario mensual",
      expenseBudgetName: "Gastos del hogar",
      debtName: "",
      goalName: "Fondo de oportunidades",
      holdingLabel: "Certificado a plazo",
    },
  };
}
