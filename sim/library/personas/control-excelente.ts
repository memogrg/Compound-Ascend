/**
 * Control excelente — disciplined: positive free cashflow, small low-rate debt,
 * a savings goal, one (non-quoted) investment. High compliance/saving, low
 * impulsivity → pays extra on debt, contributes to the goal, invests, rarely
 * hit by emergencies. Amounts derived from the seed.
 */
import { createPrng } from "../../prng";
import type { PersonaSpec } from "../persona-types";

export function buildControlExcelente(seed: number): PersonaSpec {
  const rng = createPrng(seed);
  const monthlyIncome = rng.amount(800_000, 950_000, 50_000);
  return {
    key: "control-excelente",
    displayName: "Control Excelente",
    seed,
    demographics: { ageBand: "adulto", household: "pareja", dependents: 0 },
    traits: {
      spendImpulsivity: 0.15,
      savingTendency: 0.8,
      riskAversion: 0.4,
      budgetCompliance: 0.9,
      emergencySensitivity: 0.2,
    },
    setup: {
      currencyAmountsLabel: "moneda única del run",
      openingBalance: rng.amount(400_000, 600_000, 50_000),
      monthlyIncome,
      incomeRegular: true,
      payDay: 5,
      fixedExpenseMonthly: rng.amount(220_000, 300_000, 20_000),
      hasDebt: true,
      debtBalance: rng.amount(200_000, 300_000, 50_000),
      debtMinPayment: rng.amount(12_000, 18_000, 2_000),
      hasGoal: true,
      goalTarget: rng.amount(150_000, 250_000, 50_000),
      hasInvestment: true,
      investmentValue: rng.amount(350_000, 500_000, 50_000),
      incomeSourceName: "Salario",
      expenseItemName: "Renta",
      incomeBudgetName: "Salario mensual",
      expenseBudgetName: "Gastos del hogar",
      debtName: "Tarjeta de crédito",
      goalName: "Fondo de viaje",
      holdingLabel: "Certificado a plazo",
    },
  };
}
