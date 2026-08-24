/**
 * INDEPENDENT temporal oracle for Fase 7 — re-derives every expected series from the persona SCRIPT
 * (./persona.ts constants) with its OWN accounting model. Imports NOTHING from src/modules: the app
 * is judged against this re-derivation, not its own stored numbers. The math mirrors the Fase-4
 * oracle's event-sourced style (metrics.ts) re-implemented here as reference, never imported.
 *
 * Accounting model (single currency, apr 0):
 *   - realExpense(m) = plainExpense(m) + debtPayment(m)   (a debt payment is an on-budget expense)
 *   - freeCashflow(m) = income(m) − realExpense(m)
 *   - liquidity(m) = opening + Σ (income − plainExpense − debtPayment)   (cash out = both)
 *   - debt(m) = debtInitial − Σ debtPayment
 *   - netWorth(m) = liquidity(m) − debt(m)               (the debt payment washes out here)
 *   - velocity(m) = netWorth(m) − netWorth(m−1)          (= income − plainExpense; null at m0)
 */
import { OPENING_BALANCE, DEBT_INITIAL, DEBT_PAYMENT, INCOME, EXPENSE, MONTHS } from "./persona";

export interface MonthOracle {
  income: number;
  expense: number; // realExpense = plain + debt payment
  freeCashflow: number;
  liquidity: number;
  debt: number;
  netWorth: number;
  velocity: number | null;
}

/** Re-derive the full month-by-month series from the script. */
export function deriveSeries(): MonthOracle[] {
  const out: MonthOracle[] = [];
  let liquidity = OPENING_BALANCE;
  let debt = DEBT_INITIAL;
  let prevNetWorth: number | null = null;
  for (let m = 0; m < MONTHS; m++) {
    const income = INCOME[m]!;
    const plainExpense = EXPENSE[m]!;
    const expense = plainExpense + DEBT_PAYMENT;
    liquidity += income - plainExpense - DEBT_PAYMENT;
    debt -= DEBT_PAYMENT;
    const netWorth = liquidity - debt;
    out.push({
      income,
      expense,
      freeCashflow: income - expense,
      liquidity,
      debt,
      netWorth,
      velocity: prevNetWorth === null ? null : netWorth - prevNetWorth,
    });
    prevNetWorth = netWorth;
  }
  return out;
}

export interface OracleTrajectory {
  savingsRateDir: "sube" | "baja" | "estable";
  savingsDeltaPp: number;
  expenseDir: "sube" | "baja" | "estable";
  expensePct: number;
}

/**
 * Expected trajectory of the monthly series, re-implementing computeTrajectory's first-vs-last
 * comparison + stable bands (SAVINGS_PP_STABLE=2, PCT_STABLE=3) as REFERENCE — so we predict what
 * the app's computeTrajectory should output and assert equality, rather than trusting it.
 */
export function oracleTrajectory(series: MonthOracle[]): OracleTrajectory {
  const first = series[0]!;
  const last = series[series.length - 1]!;
  const r0 = (first.freeCashflow / first.income) * 100;
  const r1 = (last.freeCashflow / last.income) * 100;
  const deltaPp = Math.round((r1 - r0) * 10) / 10;
  const expensePct = Math.round(((last.expense - first.expense) / first.expense) * 100);
  const dir = (v: number, band: number): "sube" | "baja" | "estable" =>
    Math.abs(v) < band ? "estable" : v > 0 ? "sube" : "baja";
  return {
    savingsRateDir: dir(deltaPp, 2),
    savingsDeltaPp: deltaPp,
    expenseDir: dir(expensePct, 3),
    expensePct,
  };
}

/**
 * ANTI-DEFANG self-check: the oracle's OWN identities must hold before it is used to judge the app.
 * If ANY of these fail, the ORACLE is wrong (oracle-bug), not the app. Returns a list of violations
 * (empty = the oracle is internally consistent and trustworthy).
 */
export function oracleSelfCheck(series: MonthOracle[]): string[] {
  const errs: string[] = [];
  if (series.length !== MONTHS) errs.push(`largo ${series.length} != MONTHS ${MONTHS}`);
  let liq = OPENING_BALANCE;
  let debt = DEBT_INITIAL;
  for (let m = 0; m < series.length; m++) {
    const s = series[m]!;
    liq += INCOME[m]! - EXPENSE[m]! - DEBT_PAYMENT;
    debt -= DEBT_PAYMENT;
    if (s.netWorth !== liq - debt) errs.push(`m${m}: netWorth ${s.netWorth} != liq−debt ${liq - debt}`);
    if (s.velocity !== null && s.velocity !== INCOME[m]! - EXPENSE[m]!)
      errs.push(`m${m}: velocity ${s.velocity} != income−plainExpense ${INCOME[m]! - EXPENSE[m]!}`);
    if (s.debt < 0) errs.push(`m${m}: debt negativo ${s.debt}`);
    if (s.expense !== EXPENSE[m]! + DEBT_PAYMENT) errs.push(`m${m}: expense ${s.expense} != plain+pago`);
  }
  const lastNw = series[series.length - 1]!.netWorth;
  const sumVel = series.slice(1).reduce((a, s) => a + (s.velocity ?? 0), 0);
  if (sumVel !== lastNw - series[0]!.netWorth)
    errs.push(`Σvelocity ${sumVel} != Δnet ${lastNw - series[0]!.netWorth}`);
  if (debt !== 0) errs.push(`deuda final ${debt} != 0`);
  return errs;
}

/**
 * DCA closed-form (price-AGNOSTIC, order-INDEPENDENT). A monthly contribution of `contribution` at
 * price p adds `contribution/p` units but always `contribution` of cost, so the weighted average is
 * Σcost / Σqty — a value that does NOT depend on the order of the prices. This is the invariant the
 * app's running average must equal (mirrors createHolding/ensureMonthlyContributions' merge formula).
 */
export function dcaExpected(
  qty0: number,
  price0: number,
  contribution: number,
  prices: number[],
): { quantity: number; average: number; invested: number } {
  let quantity = qty0;
  let invested = qty0 * price0;
  for (const p of prices) {
    quantity += contribution / p;
    invested += contribution;
  }
  return { quantity, average: invested / quantity, invested };
}
