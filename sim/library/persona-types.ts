/**
 * F2 persona model. Generalizes the F1c scripted persona into a diverse library:
 * identity/demographics + a financial setup + 5 behavioral traits (0–1) that the
 * behavior engine turns into REAL app events. F1c's scripted vertical slice stays
 * as-is; this is the motor-driven library layered on the same harness/driver.
 */

export interface Demographics {
  ageBand: "joven" | "adulto" | "mayor";
  household: "soltero" | "pareja" | "familia";
  dependents: number;
}

/** Behavioral traits, each 0–1. The engine reads these to decide daily events. */
export interface BehaviorTraits {
  /** Frequency & size of discretionary spending. */
  spendImpulsivity: number;
  /** Propensity to move money into goals/savings. */
  savingTendency: number;
  /** High = avoids investing. */
  riskAversion: number;
  /** Sticks to the plan / pays more than the minimum. */
  budgetCompliance: number;
  /** Probability of emergencies + how hard they hit. */
  emergencySensitivity: number;
}

/** Concrete (seed-derived) financial setup. Conditional entities via has* flags. */
export interface FinancialSetup {
  currencyAmountsLabel: string; // human note; amounts are in the run's single currency
  openingBalance: number;
  monthlyIncome: number;
  incomeRegular: boolean;
  /** Day of the month the salary lands (1–28). */
  payDay: number;
  fixedExpenseMonthly: number;
  hasDebt: boolean;
  debtBalance: number;
  debtMinPayment: number;
  hasGoal: boolean;
  goalTarget: number;
  hasInvestment: boolean;
  investmentValue: number;
  // Labels for the seeded entities.
  incomeSourceName: string;
  expenseItemName: string;
  incomeBudgetName: string;
  expenseBudgetName: string;
  debtName: string;
  goalName: string;
  holdingLabel: string;
}

export interface PersonaSpec {
  key: string;
  displayName: string;
  seed: number;
  demographics: Demographics;
  traits: BehaviorTraits;
  setup: FinancialSetup;
}

/** A builder turns a seed into a concrete persona (traits fixed per archetype,
 *  amounts jittered deterministically by the seed). */
export type PersonaBuilder = (seed: number) => PersonaSpec;

/**
 * A planned event the engine emits for a given day. The runner executes each via
 * the app-driver (real ctx-aware services) and folds its known delta into the
 * expectations, so invariants stay exact whatever the behavior.
 */
export type PlannedEvent =
  | { kind: "income"; amount: number }
  | { kind: "expense"; amount: number; label: string; fixed: boolean }
  | { kind: "debtPayment"; amount: number }
  | { kind: "goalContribution"; amount: number }
  | { kind: "goalSpend"; amount: number }
  | { kind: "goalWithdraw"; amount: number }
  | { kind: "investmentBuy"; amount: number }
  | { kind: "lifeEvent"; incomeMultiplier: number; label: string };

/** Ids of the entities seeded for a persona (null when the archetype lacks one). */
export interface SimEntityIds {
  incomeLineId: string;
  debtId: string | null;
  goalId: string | null;
  holdingId: string | null;
}

/** Mutable run state the engine reads and the runner updates after each event. */
export interface SimState {
  ids: SimEntityIds;
  /** Running expected liquidity (cumulative across months). */
  liquidity: number;
  /** Running goal balance (contributions − spends − withdrawals). */
  goalCurrent: number;
  /** Income scaler from life events (job change). */
  incomeMultiplier: number;
}

/** Per-month tally the runner accumulates from the executed event stream, then
 *  checks against the month's `getMonthFlow` / linked movements at close. */
export interface MonthTally {
  operatingIncome: number;
  operatingExpense: number;
  capitalOut: number;
  /** Budget-aware spend = operating expense + capital out (adherence.spent). */
  budgetAwareSpend: number;
  debtMovs: number;
  goalMovs: number;
  jarSpends: number;
}

export function emptyMonthTally(): MonthTally {
  return {
    operatingIncome: 0,
    operatingExpense: 0,
    capitalOut: 0,
    budgetAwareSpend: 0,
    debtMovs: 0,
    goalMovs: 0,
    jarSpends: 0,
  };
}
