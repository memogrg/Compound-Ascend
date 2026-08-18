/**
 * Oracle types: the RAW rows the oracle re-derives from, the independent metric
 * outputs, and the comparison verdicts. `metrics.ts` consumes ONLY these plain row
 * shapes — it never imports from src/modules. Everything is single-currency (CRC) in
 * the sim runs, so amounts are taken at face value (convertCurrency is identity).
 */

// ---- RAW rows (minimal columns the oracle needs), read via ctx.db in raw.ts ----

export interface RawTxn {
  kind: string; // 'ingreso' | 'gasto' | ...
  amount: number;
  occurred_on: string;
  linked_kind: string; // 'none' | 'debt' | 'goal' | 'holding' | ...
  linked_id: string | null;
  counts_in_budget: boolean;
  category_id: string | null;
  status: string;
}

export interface RawLedger {
  delta: number;
  reason: string;
}

export interface RawIncomeSource {
  amount_monthly_base: number;
  include_in_budget: boolean;
}

export interface RawExpenseItem {
  amount_monthly_base: number;
  nature: string; // 'esencial' | 'estilo_vida' | 'ahorro' | 'inversion' | 'financiero'
}

export interface RawBudgetItem {
  type: string; // 'income' | 'expense'
  amount: number;
  category_id: string | null;
  period_year: number;
  period_month: number;
}

export interface RawDebt {
  id: string;
  original_amount: number | null;
  balance: number;
  apr: number | null;
  current_payment: number | null;
  min_payment: number | null;
}

export interface RawDebtPayment {
  debt_id: string;
  occurred_on: string;
  amount: number;
  extra_amount: number | null;
  kind: string; // 'ordinario' | 'extraordinario'
}

export interface RawHoldingContribution {
  holding_id: string;
  amount: number;
  unit_price: number | null;
}

export interface RawInvestmentTxn {
  holding_id: string | null;
  tx_type: string | null; // 'compra' | 'venta' | ...
  amount: number;
  quantity: number | null;
}

export interface RawHolding {
  id: string;
  asset_type: string;
  symbol: string | null;
  label: string;
  current_value_manual: number | null;
}

export interface RawGoal {
  id: string;
  current_amount: number;
  target_amount: number;
}

export interface RawData {
  txns: RawTxn[];
  ledger: RawLedger[];
  incomes: RawIncomeSource[];
  expenses: RawExpenseItem[];
  budgetItems: RawBudgetItem[];
  debts: RawDebt[];
  debtPayments: RawDebtPayment[];
  holdingContributions: RawHoldingContribution[];
  investmentTxns: RawInvestmentTxn[];
  holdings: RawHolding[];
  goals: RawGoal[];
}

/** A price the SCENARIO fixed (the DCA mock). symbol (uppercased) → price. */
export type PriceBook = Record<string, number>;

/** An initial quoted position the scenario seeded (a KNOWN event, not read from the
 *  app's stored quantity/average_cost — that would reuse the app's merge). */
export interface InitialPosition {
  holdingId: string;
  symbol: string;
  quantity: number;
  unitCost: number;
}

// ---- Comparison ----

export type Severity = "identity" | "sanity" | "characterization";
export type Verdict = "ok" | "characterization" | "critical";

export interface Discrepancy {
  metric: string;
  persona: string;
  oracle: number | null;
  app: number | null;
  delta: number | null;
  /** Expected model difference (app − oracle) for characterization metrics, or null
   *  when a clean number isn't practical (then rely on oracle/app/Δ + note). */
  expectedModelDiff: number | null;
  tolerance: number;
  severity: Severity;
  verdict: Verdict;
  note: string;
}
