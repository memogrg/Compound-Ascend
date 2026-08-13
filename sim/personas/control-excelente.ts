/**
 * First persona — "control excelente": a disciplined user with positive free
 * cashflow, a small debt, one savings goal and one (non-quoted) investment.
 * Every amount and event is derived from the seed via the deterministic PRNG, so
 * the whole run is reproducible. Invariants (computed in the runner) rely on the
 * relations enforced here: income > expenses, debtPaid ≤ balance,
 * goalSpent ≤ goalContributed.
 */
import { createPrng } from "../prng";

export interface PersonaSetup {
  openingBalance: number;
  incomeSourceName: string;
  incomeSourceMonthly: number;
  expenseItemName: string;
  expenseItemMonthly: number;
  incomeBudgetName: string;
  incomeBudgetAmount: number;
  expenseBudgetName: string;
  expenseBudgetAmount: number;
  debtName: string;
  debtBalance: number;
  debtMinPayment: number;
  goalName: string;
  goalTarget: number;
  holdingLabel: string;
  holdingValue: number;
}

export interface PersonaEvents {
  incomeReceived: number;
  expenseSpent: number;
  debtPaid: number;
  goalContributed: number;
  goalSpent: number;
}

/** Virtual day offsets (after day 0) at which each event fires — all in the same month. */
export interface PersonaDays {
  income: number;
  expense: number;
  debt: number;
  goalContribution: number;
  goalSpend: number;
}

export interface PersonaSpec {
  key: string;
  displayName: string;
  seed: number;
  setup: PersonaSetup;
  events: PersonaEvents;
  days: PersonaDays;
}

export function buildControlExcelente(seed: number): PersonaSpec {
  const rng = createPrng(seed);

  const incomeSourceMonthly = rng.amount(700_000, 1_000_000, 50_000);
  const expenseItemMonthly = rng.amount(200_000, 350_000, 25_000);
  const openingBalance = rng.amount(300_000, 700_000, 50_000);
  const debtBalance = rng.amount(200_000, 400_000, 50_000);
  const debtMinPayment = rng.amount(10_000, 20_000, 5_000);
  const goalTarget = rng.amount(150_000, 300_000, 50_000);
  const holdingValue = rng.amount(300_000, 600_000, 50_000);

  const incomeReceived = incomeSourceMonthly; // receives the full salary this month
  const expenseSpent = rng.amount(30_000, 60_000, 5_000);
  const debtPaid = rng.amount(15_000, 30_000, 5_000); // ≤ debtBalance by construction
  const goalContributed = rng.amount(50_000, 90_000, 10_000);
  const goalSpent = rng.amount(10_000, 30_000, 5_000); // ≤ goalContributed by construction

  return {
    key: "control-excelente",
    displayName: "Control Excelente",
    seed,
    setup: {
      openingBalance,
      incomeSourceName: "Salario",
      incomeSourceMonthly,
      expenseItemName: "Renta",
      expenseItemMonthly,
      incomeBudgetName: "Salario mensual",
      incomeBudgetAmount: incomeSourceMonthly,
      expenseBudgetName: "Gastos del hogar",
      expenseBudgetAmount: expenseItemMonthly,
      debtName: "Tarjeta de crédito",
      debtBalance,
      debtMinPayment,
      goalName: "Fondo de viaje",
      goalTarget,
      holdingLabel: "Certificado a plazo",
      holdingValue,
    },
    events: {
      incomeReceived,
      expenseSpent,
      debtPaid,
      goalContributed,
      goalSpent,
    },
    days: {
      income: 1,
      expense: 2,
      debt: 3,
      goalContribution: 4,
      goalSpend: 5,
    },
  };
}
