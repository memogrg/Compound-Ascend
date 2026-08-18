/**
 * AI-audit types. The audit evaluates the REAL advisor's observable reasoning on
 * REAL sim-seeded personas at two time points, with a HYBRID scorer:
 *  - deterministic hard checks (grounding, contradictions) → concrete ❌, judge-free.
 *  - a graded 0-5 LLM judge for the SUBJECTIVE dimensions only.
 */

/** The seven SUBJECTIVE dimensions scored 0-5 by the judge (objective ones are
 *  covered by deterministic checks instead). */
export const SUBJECTIVE_DIMS = [
  "relevancia",
  "personalizacion",
  "accionabilidad",
  "prioridad",
  "conciencia_temporal",
  "explicacion",
  "valor",
] as const;
export type SubjectiveDim = (typeof SUBJECTIVE_DIMS)[number];
export type RubricScores = Record<SubjectiveDim, number>;

export type ProbeSuite = "adversarial" | "longitudinal" | "consistencia" | "generico";

/** The facts a deterministic checker needs — the persona's REAL numbers. */
export interface ContextFacts {
  currency: string;
  incomeMonthly: number;
  expenseMonthly: number;
  freeCashflow: number;
  savingsRatePct: number;
  netWorth: number;
  /** Trend of net worth month1→month6, if known. */
  netWorthTrend?: "sube" | "baja" | "estable";
  debts: { name: string; balance: number; apr: number }[];
  goalsProgressPct: number;
  portfolioValue: number;
  /** Every real figure the advisor is allowed to cite (for grounding), rounded. */
  knownFigures: number[];
}

export interface Contradiction {
  kind:
    | "invertir-en-deficit"
    | "pagar-deuda-saldada"
    | "felicitar-en-caida"
    | "meta-lujo-sin-cubrir";
  detail: string;
}

export interface GroundingResult {
  citedFigures: number[];
  /** Cited figures with no match in the real context (potential fabrication). */
  unmatched: number[];
  ok: boolean;
}

/** One advisor output under audit. */
export interface AuditOutput {
  persona: string;
  point: "mes1" | "mes6";
  suite: ProbeSuite;
  prompt: string;
  reply: string;
  actionType: string | null;
  lane?: string;
  grounding: GroundingResult;
  contradictions: Contradiction[];
  /** Rubric averaged over N judge runs; null when the judge was unavailable. */
  rubric: RubricScores | null;
  /** Suite-specific expected red-flags passed to the judge (for grounded scoring). */
  expectedRedFlags: string[];
}

export type FindingKind =
  | "contradiccion"
  | "grounding"
  | "generico"
  | "temporal"
  | "app-finding";

export interface Finding {
  kind: FindingKind;
  persona: string;
  detail: string;
}
