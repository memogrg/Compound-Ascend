/**
 * Deterministic grounding check: parse the MONEY figures the advisor cites and verify
 * each is backed by the persona's REAL context — not the judge's discretion. Conservative
 * to avoid false positives: only money-sized figures are checked, and a cited figure is
 * accepted if it matches a known figure OR a plausible monthly/annual projection of one
 * (known × n, n=1..24). Anything left over is flagged as a potential fabrication.
 *
 * El parseo y la extracción de montos viven en `@/lib/ai/money-figures` (núcleo PURO compartido con
 * el guard de tendencia de producción): así "qué cuenta como cifra citada" es idéntico en prod y audit.
 */
import type { ContextFacts, GroundingResult } from "./types";
import { extractMoneyFigures, near } from "@/lib/ai/money-figures";

// Solo se aceptan proyecciones SIGNIFICATIVAS de una cifra conocida (mensual→anual, etc.). Un barrido
// amplio ×1..24 haría "matchear" casi cualquier redondo con algún known×n y anularía el check.
const MULTIPLIERS = [1, 2, 3, 6, 12, 24];
const DIVISORS = [2, 3, 6, 12];

function matchesKnown(figure: number, known: number[]): boolean {
  for (const k of known) {
    if (k <= 0) continue;
    for (const n of MULTIPLIERS) if (near(figure, k * n)) return true;
    for (const n of DIVISORS) if (near(figure, k / n)) return true;
  }
  return false;
}

export { extractMoneyFigures };

export function checkGrounding(reply: string, facts: ContextFacts): GroundingResult {
  const citedFigures = extractMoneyFigures(reply);
  const unmatched = citedFigures.filter((f) => !matchesKnown(f, facts.knownFigures));
  return { citedFigures, unmatched, ok: unmatched.length === 0 };
}
