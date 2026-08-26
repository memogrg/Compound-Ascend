/**
 * AI-audit types. The audit evaluates the REAL advisor's observable reasoning on
 * REAL sim-seeded personas at two time points, with a HYBRID scorer:
 *  - deterministic hard checks (grounding, contradictions) → concrete ❌, judge-free.
 *  - a graded 0-5 LLM judge for the SUBJECTIVE dimensions only.
 */

/**
 * The NINE SUBJECTIVE dimensions scored 0-5 by the judge (the objective axes —
 * grounding, contradicciones — stay a deterministic gate APART, never a dimension).
 * They encode the "EXIGENTE Y CÁLIDO" charter: guía · consulta cuando faltan datos ·
 * acciona cuantificado · alarmas proactivas · highlights · confronta firme+cálido ·
 * grounded. Five are ALWAYS scored; the four in CONDITIONAL_DIMS may be "NA" when the
 * turn doesn't call for them (a clarifying question is EXCELLENT on consulta_apropiada
 * and N/A on accionabilidad — this is what fixes the old artifact that punished it).
 */
export const SUBJECTIVE_DIMS = [
  "relevancia",
  "personalizacion",
  "prioridad",
  "accionabilidad",
  "consulta_apropiada",
  "proactividad",
  "confrontacion_calida",
  "conciencia_temporal",
  "explicacion_y_tono",
] as const;
export type SubjectiveDim = (typeof SUBJECTIVE_DIMS)[number];

/** The four CONDITIONAL dims: the judge returns "NA" when the turn doesn't warrant them,
 *  and "NA" is EXCLUDED from the composite (not scored 0). Everything else is always scored. */
export const CONDITIONAL_DIMS = [
  "accionabilidad",
  "consulta_apropiada",
  "proactividad",
  "confrontacion_calida",
] as const satisfies readonly SubjectiveDim[];
export function isConditionalDim(d: SubjectiveDim): boolean {
  return (CONDITIONAL_DIMS as readonly string[]).includes(d);
}

/** A dimension's value: an integer 0-5, or "NA" (only valid for CONDITIONAL_DIMS). */
export type DimScore = number | "NA";
export type RubricScores = Record<SubjectiveDim, DimScore>;

export type ProbeSuite =
  | "adversarial"
  | "longitudinal"
  | "consistencia"
  | "generico"
  | "proactividad"
  | "confrontacion"
  | "highlights";

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
    "invertir-en-deficit" | "pagar-deuda-saldada" | "felicitar-en-caida" | "meta-lujo-sin-cubrir";
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

export type FindingKind = "contradiccion" | "grounding" | "generico" | "temporal" | "app-finding";

export interface Finding {
  kind: FindingKind;
  persona: string;
  detail: string;
}
