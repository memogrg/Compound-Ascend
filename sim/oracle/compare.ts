/**
 * Turn an (oracle, app) pair into a typed verdict.
 *
 * Two blocking classes (fail the build):
 *  - sanity: any value NaN / Infinity / undefined.
 *  - identity: the core accounting identities (neto=activos−pasivos, composición,
 *    identidad del saco, sin doble conteo) — corruption if broken.
 * Everything else is CHARACTERIZATION: reported with oracle/app/Δ and, where practical,
 * the EXPECTED model difference so the reader can tell "Δ = known model" from
 * "Δ > model" (possible bug). Characterization never fails the build (Fase 10 decides
 * which to promote).
 */
import { isFinancialNumber } from "./metrics";
import type { Discrepancy } from "./types";

interface CompareInput {
  metric: string;
  persona: string;
  oracle: number | null | undefined;
  app: number | null | undefined;
  tolerance: number;
  /** null for sanity/identity; a number (or null when impractical) for characterization. */
  expectedModelDiff?: number | null;
  note?: string;
}

/** Core identity check — blocks on divergence beyond tolerance. */
export function compareIdentity(input: CompareInput): Discrepancy {
  const base = finiteGuard(input, "identity");
  if (base) return base;
  const oracle = input.oracle as number;
  const app = input.app as number;
  const delta = round2(app - oracle);
  const ok = Math.abs(delta) <= input.tolerance;
  return {
    metric: input.metric,
    persona: input.persona,
    oracle,
    app,
    delta,
    expectedModelDiff: null,
    tolerance: input.tolerance,
    severity: "identity",
    verdict: ok ? "ok" : "critical",
    note: ok ? input.note ?? "identidad núcleo satisfecha" : `IDENTIDAD ROTA: Δ=${delta} > tol ${input.tolerance}`,
  };
}

/** Characterization check — always reported, never blocks (unless a value is non-finite). */
export function compareCharacterization(input: CompareInput): Discrepancy {
  const base = finiteGuard(input, "characterization");
  if (base) return base;
  const oracle = input.oracle as number;
  const app = input.app as number;
  const rawDelta = app - oracle;
  const delta = round2(rawDelta);
  const expected = input.expectedModelDiff ?? null;
  let note: string;
  if (expected === null) {
    note = input.note ?? "oracle vs app (sin modelo esperado práctico)";
  } else {
    // Residual sobre valores CRUDOS, no sobre el delta ya redondeado a 2 decimales: para
    // ratios de 3 decimales (tasa de ahorro), round2(0.125)=0.13 vs esperado 0.125 daba un
    // residual falso de 0.01. La decisión usa el crudo; el residual se muestra redondeado fino.
    const rawResidual = rawDelta - expected;
    const shownResidual = Math.round(rawResidual * 1000) / 1000;
    note =
      Math.abs(rawResidual) <= input.tolerance
        ? `Δ coincide con el modelo conocido (esperado=${expected})`
        : `Δ EXCEDE el modelo conocido (esperado=${expected}, residual=${shownResidual}) — posible bug`;
    if (input.note) note = `${input.note} · ${note}`;
  }
  return {
    metric: input.metric,
    persona: input.persona,
    oracle,
    app,
    delta,
    expectedModelDiff: expected,
    tolerance: input.tolerance,
    severity: "characterization",
    verdict: "characterization",
    note,
  };
}

/** If either value is non-finite, return a blocking sanity Discrepancy; else null. */
function finiteGuard(input: CompareInput, severity: "identity" | "characterization"): Discrepancy | null {
  const oracleBad = !isFinancialNumber(input.oracle);
  const appBad = !isFinancialNumber(input.app);
  if (!oracleBad && !appBad) return null;
  const who = oracleBad && appBad ? "oracle y app" : oracleBad ? "oracle" : "app";
  return {
    metric: input.metric,
    persona: input.persona,
    oracle: isFinancialNumber(input.oracle) ? input.oracle : null,
    app: isFinancialNumber(input.app) ? input.app : null,
    delta: null,
    expectedModelDiff: null,
    tolerance: input.tolerance,
    severity: "sanity",
    verdict: "critical",
    note: `VALOR NO FINITO (${who}) en métrica de ${severity}: ${showVal(input.oracle)} / ${showVal(input.app)}`,
  };
}

const showVal = (x: unknown): string =>
  x === undefined ? "undefined" : x === null ? "null" : typeof x === "number" && !Number.isFinite(x) ? String(x) : String(x);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** True if any discrepancy is blocking. */
export function hasCritical(ds: readonly Discrepancy[]): boolean {
  return ds.some((d) => d.verdict === "critical");
}
