/** Explicit tolerances (single-currency CRC runs). */

/** Exact-to-cent metrics: liquidity, flow, goal (one round2 each). */
export const CENT_EPS = 0.01;
/** Net worth crosses several engines that each round2 → 1 currency unit. */
export const MONEY_EPS = 1;
/** Ratios (savings rate, return %) in 0..1, rounded to 3 decimals. */
export const RATIO_EPS = 0.001;
