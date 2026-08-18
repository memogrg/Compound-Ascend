/**
 * Independent financial oracle — PURE math, re-derived from RAW rows. This file
 * imports NOTHING from src/modules: every number here comes from the raw ledgers,
 * with the oracle's own formulas, so a divergence from the app's services is a real
 * signal, not a shared bug. Single-currency (CRC) runs → amounts at face value.
 *
 * Independence rules honored here:
 *  - Debt balance: replayed from debt_payments by ACTUAL elapsed days (apr/365·days),
 *    not one-month-per-payment.
 *  - Portfolio: quantity/invested re-derived from the KNOWN initial position + the raw
 *    holding_contributions ledger (amount/unit_price) — NEVER from the app's stored
 *    quantity/average_cost (that would reuse the app's weighted-average merge).
 *  - Goal saved: Σ signed linked 'goal' transactions — not savings_goals.current_amount.
 */
import type { InitialPosition, PriceBook, RawData, RawTxn } from "./types";

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Sanity: a real, finite number (rejects NaN, ±Infinity, undefined). */
export function isFinancialNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

const sum = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((s, x) => s + f(x), 0);

const CAPITAL_LINKS = new Set(["holding", "goal"]); // excluded from operating flow
const isConfirmed = (t: { status: string }): boolean => t.status === "confirmed";

// ---- Liquidity (identidad del saco) ----

/** Balance = Σ ledger deltas. The signs were set by the app at write time; the oracle
 *  only sums them, so this reconciles the reported balance against its own ledger. */
export function oracleLiquidity(raw: RawData): number {
  return round2(sum(raw.ledger, (l) => l.delta));
}

// ---- Monthly flow ----

export interface FlowParts {
  operatingIncome: number;
  operatingExpense: number;
  operatingFlow: number;
  /** Real flow INCLUDING capital moves (holding buy / goal contribution) — the base-v2
   *  "freeCashflowReal" shape, for the zone-2 contrast against operatingFlow. */
  freeCashflowReal: number;
}

/** Operating flow excludes capital (holding/goal) and off-budget rows; freeCashflowReal
 *  includes capital-out gastos. The gap between them IS fragile zone 2. Scoped to the
 *  SAME period the app's getMonthFlow reports (occurred_on within [from, to] inclusive)
 *  — getMonthFlow loads listTransactions(period), so an unscoped sum over the whole run
 *  would over-count every prior month. */
export function oracleFlow(raw: RawData, period: { from: string; to: string }): FlowParts {
  const inPeriod = (t: RawTxn): boolean => t.occurred_on >= period.from && t.occurred_on <= period.to;
  const confirmed = raw.txns.filter((t) => isConfirmed(t) && inPeriod(t));
  const opIncome = sum(
    confirmed.filter((t) => t.kind === "ingreso" && !CAPITAL_LINKS.has(t.linked_kind)),
    (t) => t.amount,
  );
  const opExpense = sum(
    confirmed.filter(
      (t) => t.kind === "gasto" && !CAPITAL_LINKS.has(t.linked_kind) && t.counts_in_budget !== false,
    ),
    (t) => t.amount,
  );
  // Real flow: all confirmed income vs all confirmed on-budget gasto INCLUDING capital-out.
  const realIncome = sum(confirmed.filter((t) => t.kind === "ingreso"), (t) => t.amount);
  const realExpense = sum(
    confirmed.filter((t) => t.kind === "gasto" && t.counts_in_budget !== false),
    (t) => t.amount,
  );
  return {
    operatingIncome: round2(opIncome),
    operatingExpense: round2(opExpense),
    operatingFlow: round2(opIncome - opExpense),
    freeCashflowReal: round2(realIncome - realExpense),
  };
}

// ---- Savings rate (fragile zone 1) ----

export interface SavingsParts {
  income: number;
  allocations: number; // ahorro + inversión envelopes (planned config)
  leftover: number; // max(0, income − allExpenses) — the free cash the app also credits
  oracleRate: number; // allocations / income  (does NOT credit leftover)
  appRate: number; // (ahorro + max(0,leftover)) / income  (app's definition)
  expectedModelDiff: number; // appRate − oracleRate = leftover-as-savings term
}

/** Independent savings rate from the mensualized plan (income_sources / expense_items).
 *  Oracle credits ONLY real allocations; the app also credits unspent free cash — that
 *  overlap is the expected model difference. */
export function oracleSavingsRate(raw: RawData): SavingsParts {
  const income = sum(raw.incomes.filter((i) => i.include_in_budget), (i) => i.amount_monthly_base);
  const byNature = (n: string): number =>
    sum(raw.expenses.filter((e) => e.nature === n), (e) => e.amount_monthly_base);
  const allExpenses = sum(raw.expenses, (e) => e.amount_monthly_base);
  const ahorro = byNature("ahorro");
  const inversion = byNature("inversion");
  const allocations = ahorro + inversion;
  const leftover = income - allExpenses;
  const ratio = (part: number): number => (income <= 0 ? 0 : Math.round((part / income) * 1000) / 1000);
  const oracleRate = ratio(allocations);
  const appRate = ratio(ahorro + Math.max(0, leftover));
  return {
    income: round2(income),
    allocations: round2(allocations),
    leftover: round2(leftover),
    oracleRate,
    appRate,
    expectedModelDiff: Math.round((appRate - oracleRate) * 1000) / 1000,
  };
}

// ---- Debt balance (fragile zones 3 & 4) ----

const MS_PER_DAY = 86_400_000;
function daysBetween(aISO: string, bISO: string): number {
  const a = Date.parse(aISO + "T00:00:00Z");
  const b = Date.parse(bISO + "T00:00:00Z");
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}

/**
 * Replay a debt from debt_payments accruing interest by ACTUAL elapsed days
 * (apr/100/365 · days), not one full month per payment. For the first payment there is
 * no prior date, so ~30 days (≈ the app's one month) is used → oracle and app agree on
 * the first payment; the divergence appears only when payments cluster in a month.
 * apr = 0 (the sim's default debts) ⇒ interest 0 everywhere ⇒ oracle == app.
 */
export function oracleDebtBalance(raw: RawData, debtId: string): number {
  const debt = raw.debts.find((d) => d.id === debtId);
  if (!debt) return 0;
  const apr = debt.apr ?? 0;
  let balance = debt.original_amount ?? debt.balance;
  const payments = raw.debtPayments
    .filter((p) => p.debt_id === debtId)
    .slice()
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));
  let prevDate: string | null = null;
  for (const p of payments) {
    if (p.kind === "extraordinario") {
      const principal = Math.min(p.amount, balance);
      balance -= principal;
      continue; // no interest, does not advance the clock
    }
    const days = prevDate ? daysBetween(prevDate, p.occurred_on) : 30;
    const interest = balance * (apr / 100) * (days / 365);
    let principal = p.amount - interest + (p.extra_amount ?? 0);
    if (principal < 0) principal = 0;
    if (principal > balance) principal = balance;
    balance -= principal;
    prevDate = p.occurred_on;
  }
  return round2(Math.max(0, balance));
}

/** Σ current balances across all debts (day-count replay). */
export function oracleDebtsTotal(raw: RawData): number {
  return round2(sum(raw.debts, (d) => oracleDebtBalance(raw, d.id)));
}

// ---- Portfolio (fragile zones 6 & 8) ----

export interface PortfolioParts {
  invested: number; // initial cost + Σ contribution amounts (event-sourced)
  value: number; // quantity × mock price (priced holdings only)
  profitLoss: number; // value − invested
  quantity: number; // initial + Σ(contribution.amount / unit_price)
  /** The WRONG figure if one summed both event ledgers on top of the merge — used to
   *  demonstrate the #655 double-count trap (never used as "invested"). */
  doubleCountTrap: number;
}

/**
 * Event-sourced portfolio for the PRICED quoted holdings. quantity/invested come from
 * the known initial position + the raw holding_contributions ledger — never from the
 * app's stored quantity/average_cost. Value uses the same mock price the scenario fixed.
 * Unpriced or manual holdings are handled by the caller (they need the app's flag / the
 * manual value), so they are excluded here.
 */
export function oraclePortfolio(
  raw: RawData,
  prices: PriceBook,
  initials: InitialPosition[],
): PortfolioParts {
  let invested = 0;
  let value = 0;
  let quantity = 0;
  let trap = 0;
  for (const init of initials) {
    const price = prices[init.symbol.toUpperCase()];
    if (!isFinancialNumber(price)) continue; // unpriced → handled by caller (zone 6)
    const contribs = raw.holdingContributions.filter((c) => c.holding_id === init.holdingId);
    const contribUnits = sum(contribs, (c) =>
      c.unit_price && c.unit_price > 0 ? c.amount / c.unit_price : 0,
    );
    const contribAmount = sum(contribs, (c) => c.amount);
    const qty = init.quantity + contribUnits;
    const inv = init.quantity * init.unitCost + contribAmount;
    quantity += qty;
    invested += inv;
    value += qty * price;
    // Double-count trap: contributions counted a SECOND time via investment_transactions.
    const invTx = sum(
      raw.investmentTxns.filter((t) => t.holding_id === init.holdingId),
      (t) => t.amount,
    );
    trap += inv + contribAmount + invTx;
  }
  return {
    invested: round2(invested),
    value: round2(value),
    profitLoss: round2(value - invested),
    quantity: Math.round(quantity * 1e6) / 1e6,
    doubleCountTrap: round2(trap),
  };
}

// ---- Goal saved (fragile zone 5) ----

/** Independent "saved" = Σ signed linked 'goal' transactions (aporte + / retiro − /
 *  off-budget jar spend −). Compared against savings_goals.current_amount by the caller;
 *  a gap means the stored total drifted from its own linked history. */
export function oracleGoalSaved(raw: RawData, goalId: string): number {
  const linked = raw.txns.filter((t) => t.linked_kind === "goal" && t.linked_id === goalId && isConfirmed(t));
  const signed = sum(linked, (t) => {
    if (t.kind === "ingreso") return -t.amount; // withdrawal back to liquidity
    if (t.counts_in_budget === false) return -t.amount; // off-budget jar spend
    return t.amount; // contribution
  });
  return round2(signed);
}

// ---- Net worth (composition, event-sourced) ----

export interface NetWorthParts {
  liquidity: number;
  goals: number;
  portfolio: number;
  debts: number;
  netWorth: number;
}

/** Compose net worth from the oracle's OWN components. goals uses the linked-history
 *  saved (not current_amount); portfolio uses the event-sourced value; debts uses the
 *  day-count replay. */
export function oracleNetWorth(raw: RawData, prices: PriceBook, initials: InitialPosition[]): NetWorthParts {
  const liquidity = oracleLiquidity(raw);
  const goals = round2(sum(raw.goals, (g) => Math.max(0, oracleGoalSaved(raw, g.id))));
  const portfolio = oraclePortfolio(raw, prices, initials).value;
  const debts = oracleDebtsTotal(raw);
  return {
    liquidity,
    goals,
    portfolio,
    debts,
    netWorth: round2(liquidity + goals + portfolio - debts),
  };
}

// ---- Budget adherence (fragile zone 7) ----

export interface EnvelopeAdherence {
  categoryId: string;
  budget: number;
  spent: number;
  remaining: number; // budget − spent (finite even when budget = 0)
}

/** Per-category budget vs spent for a period. remaining = budget − spent (no division,
 *  so no base-zero blow-up); negative remaining = over budget. */
export function oracleBudgetAdherence(
  raw: RawData,
  period: { year: number; month: number },
): EnvelopeAdherence[] {
  const budgetByCat = new Map<string, number>();
  for (const b of raw.budgetItems) {
    if (b.type !== "expense") continue;
    if (b.period_year !== period.year || b.period_month !== period.month) continue;
    if (!b.category_id) continue;
    budgetByCat.set(b.category_id, (budgetByCat.get(b.category_id) ?? 0) + b.amount);
  }
  const spentByCat = new Map<string, number>();
  for (const t of raw.txns) {
    if (t.kind !== "gasto" || !isConfirmed(t) || t.counts_in_budget === false || !t.category_id) continue;
    spentByCat.set(t.category_id, (spentByCat.get(t.category_id) ?? 0) + t.amount);
  }
  const cats = new Set<string>([...budgetByCat.keys(), ...spentByCat.keys()]);
  return [...cats].map((categoryId) => {
    const budget = round2(budgetByCat.get(categoryId) ?? 0);
    const spent = round2(spentByCat.get(categoryId) ?? 0);
    return { categoryId, budget, spent, remaining: round2(budget - spent) };
  });
}
