/**
 * Feature-coverage matrix. The canonical feature list is EXPLICIT (not derived), so
 * the report shows exactly which app functions each persona exercised. Coverage is
 * read from the structured `fn` field on the log entries — never regex on the journal.
 */
import type { EventLog } from "../event-log";

export const COVERAGE_FEATURES = [
  "receiveIncome",
  "createTransaction",
  "addDebtPayment",
  "addGoalContribution",
  "withdrawFromGoal",
  "spendFromGoal",
  "contributeToHolding",
  "addRecurringQuotedHolding",
  "ensureMonthlyContributions",
  "snapshots",
] as const;

export type CoverageFeature = (typeof COVERAGE_FEATURES)[number];

/** Set of feature keys a run exercised (from the `fn` field on log entries). */
export function coverageOf(log: EventLog): Set<string> {
  const seen = new Set<string>();
  for (const e of log.entries) {
    const fn = e.detail?.["fn"];
    if (typeof fn === "string") seen.add(fn);
  }
  return seen;
}

/** How many canonical features this run exercised. */
export function coverageCount(log: EventLog): number {
  const seen = coverageOf(log);
  return COVERAGE_FEATURES.filter((f) => seen.has(f)).length;
}
