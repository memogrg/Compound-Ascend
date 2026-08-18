/**
 * Deterministic grounding check: parse the MONEY figures the advisor cites and verify
 * each is backed by the persona's REAL context — not the judge's discretion. Conservative
 * to avoid false positives: only money-sized figures are checked, and a cited figure is
 * accepted if it matches a known figure OR a plausible monthly/annual projection of one
 * (known × n, n=1..24). Anything left over is flagged as a potential fabrication.
 */
import type { ContextFacts, GroundingResult } from "./types";

const MIN_MONEY = 10_000; // below this, likely counts/percentages/months — not audited
const REL_TOL = 0.02; // 2% relative tolerance for rounding/display
// Only MEANINGFUL projections of a known figure are accepted (monthly→annual etc.).
// A broad ×1..24 sweep would make almost any round number "match" some known×n and
// defeat the check (e.g. netWorth×10), so the multipliers/divisors are curated.
const MULTIPLIERS = [1, 2, 3, 6, 12, 24];
const DIVISORS = [2, 3, 6, 12];

/** Parse a Spanish-formatted number token into a float. */
function parseNumberToken(tok: string): number | null {
  let t = tok.replace(/[^\d.,]/g, "");
  if (!t) return null;
  const hasDot = t.includes(".");
  const hasComma = t.includes(",");
  if (hasDot && hasComma) {
    // The rightmost separator is the decimal point.
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (hasComma) {
    // Comma as decimal only when it's the last separator with ≤2 trailing digits.
    const parts = t.split(",");
    if (parts.length === 2 && parts[1] !== undefined && parts[1].length <= 2) t = parts.join(".");
    else t = t.replace(/,/g, "");
  } else if (hasDot) {
    // Dot as thousands when groups of 3; as decimal when a single 1-2 digit tail.
    const parts = t.split(".");
    const last = parts[parts.length - 1];
    if (parts.length > 2 || (last !== undefined && last.length === 3)) t = parts.join("");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Extract cited money figures (handles "millones"/"mil" suffixes). */
export function extractMoneyFigures(reply: string): number[] {
  const out: number[] = [];
  // Match a number optionally followed by a magnitude word.
  const re = /(\d[\d.,]*)\s*(millones?|mill?|m\b|mil\b)?/gi;
  for (const m of reply.matchAll(re)) {
    const raw = m[1];
    if (raw === undefined) continue;
    // Skip percentages and years.
    const after = reply.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 1);
    if (after === "%") continue;
    let val = parseNumberToken(raw);
    if (val === null) continue;
    const mag = (m[2] ?? "").toLowerCase();
    if (mag.startsWith("mill") || mag === "m") val *= 1_000_000;
    else if (mag === "mil") val *= 1_000;
    if (val >= 1900 && val <= 2100 && !mag) continue; // year-like
    if (val >= MIN_MONEY) out.push(Math.round(val));
  }
  return out;
}

function near(figure: number, target: number): boolean {
  return Math.abs(figure - target) <= Math.max(1, target * REL_TOL);
}

function matchesKnown(figure: number, known: number[]): boolean {
  for (const k of known) {
    if (k <= 0) continue;
    for (const n of MULTIPLIERS) if (near(figure, k * n)) return true;
    for (const n of DIVISORS) if (near(figure, k / n)) return true;
  }
  return false;
}

export function checkGrounding(reply: string, facts: ContextFacts): GroundingResult {
  const citedFigures = extractMoneyFigures(reply);
  const unmatched = citedFigures.filter((f) => !matchesKnown(f, facts.knownFigures));
  return { citedFigures, unmatched, ok: unmatched.length === 0 };
}
