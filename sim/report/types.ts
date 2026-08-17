/**
 * Shared shapes for the F4 report. A `RunResult` is what the reporter consumes for
 * each persona (7 library + 1 DCA): a clean monthly SERIES (captured from
 * validateNetWorth's own reads — no extra round-trips) plus the EventLog (entries +
 * checks) for the timeline, coverage matrix and grouped checks.
 */
import type { EventLog } from "../event-log";

/** One month's key figures, captured at each close from validateNetWorth. */
export interface MonthPoint {
  /** 1-based month index. */
  month: number;
  netWorth: number;
  liquidity: number;
  /** Portfolio (investments) market value. */
  portfolio: number;
  goals: number;
  debts: number;
}

export interface RunResult {
  /** Persona key (stable id). */
  persona: string;
  displayName: string;
  series: MonthPoint[];
  log: EventLog;
}

/** A curated finding for the report's "hallazgos" section. */
export interface Finding {
  kind: "clean" | "discrepancy" | "bug-fixed";
  title: string;
  detail: string;
  /** Issue / PR reference, e.g. "#655". */
  ref?: string;
}
