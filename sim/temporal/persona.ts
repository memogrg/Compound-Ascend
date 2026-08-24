/**
 * DETERMINISTIC temporal persona — the SOURCE OF TRUTH for Fase 7. A fixed monthly script (no
 * PRNG), single currency (CRC → convertCurrency is identity), CASH + DEBT only (NO investment) so
 * the whole net-worth / velocity series is exact and market-price-independent. Variation is REAL:
 * income dips (m3) then rises (m4-5) and one heavy-expense month (m2) → net-worth velocity changes
 * sign and magnitude, and the trajectory has a real slope. The debt is paid down every month so its
 * derived balance falls 600k→0 (the debt payment is a wash for net worth — −cash +equity — but it
 * DOES appear in monthly_snapshots.expense and drives the debt-balance gate).
 *
 * The oracle (./oracle.ts) re-derives every series from THESE constants, importing nothing from
 * src/modules — the app is judged against an independent re-derivation, not its own numbers.
 */
export const CURRENCY = "CRC";
export const MONTHS = 6;

export const OPENING_BALANCE = 2_000_000;
export const DEBT_INITIAL = 600_000;
export const DEBT_MIN_PAYMENT = 100_000;
export const DEBT_PAYMENT = 100_000; // paid every month → 6×100k pays the 600k debt to exactly 0

/** Income RECEIVED each month (m0..m5): flat, then a dip (m3), then a raise (m4-5). */
export const INCOME = [1_000_000, 1_000_000, 1_000_000, 700_000, 1_200_000, 1_200_000] as const;
/** Plain (non-debt) discretionary expense each month: flat, with one heavy month (m2). */
export const EXPENSE = [800_000, 800_000, 1_300_000, 800_000, 800_000, 800_000] as const;

// Guardrails so the script stays well-formed (and the debt divides evenly).
if (INCOME.length !== MONTHS || EXPENSE.length !== MONTHS) {
  throw new Error("[temporal-persona] INCOME/EXPENSE deben tener MONTHS entradas");
}
if (DEBT_INITIAL !== DEBT_PAYMENT * MONTHS) {
  throw new Error("[temporal-persona] DEBT_INITIAL debe ser DEBT_PAYMENT×MONTHS (saldo llega a 0)");
}
