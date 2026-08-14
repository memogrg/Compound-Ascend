/**
 * Ingresos irregulares — freelancer/comisiones: income varies month to month
 * (incomeRegular:false → the engine jitters each paycheck 0.6–1.3× nominal), thin
 * buffer, a mid-sized debt, a small buffer goal, no investment. Exercises the
 * variable-income path.
 */
import { createPrng } from "../../prng";
import type { PersonaSpec } from "../persona-types";

export function buildIngresosIrregulares(seed: number): PersonaSpec {
  const rng = createPrng(seed);
  const monthlyIncome = rng.amount(500_000, 700_000, 50_000);
  return {
    key: "ingresos-irregulares",
    displayName: "Ingresos Irregulares",
    seed,
    demographics: { ageBand: "adulto", household: "soltero", dependents: 0 },
    traits: {
      spendImpulsivity: 0.5,
      savingTendency: 0.4,
      riskAversion: 0.6,
      budgetCompliance: 0.45,
      emergencySensitivity: 0.6,
    },
    setup: {
      currencyAmountsLabel: "moneda única del run",
      openingBalance: rng.amount(100_000, 200_000, 20_000),
      monthlyIncome, // nominal; el motor lo jitteriza cada mes por incomeRegular:false
      incomeRegular: false,
      payDay: 10,
      fixedExpenseMonthly: rng.amount(220_000, 280_000, 20_000),
      hasDebt: true,
      debtBalance: rng.amount(350_000, 500_000, 50_000),
      debtMinPayment: rng.amount(14_000, 22_000, 2_000),
      hasGoal: true,
      goalTarget: rng.amount(120_000, 200_000, 20_000),
      hasInvestment: false,
      investmentValue: 0,
      incomeSourceName: "Honorarios",
      expenseItemName: "Renta",
      incomeBudgetName: "Ingreso freelance",
      expenseBudgetName: "Gastos del hogar",
      debtName: "Tarjeta de crédito",
      goalName: "Colchón de meses",
      holdingLabel: "",
    },
  };
}
