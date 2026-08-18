/**
 * Graded 0-5 judge for the SUBJECTIVE dimensions (the objective ones are covered by the
 * deterministic grounding/contradiction checks). Reuses the eval-harness's fixed strong
 * judge provider + N-run averaging pattern; adds a JSON multi-dimension rubric and
 * mean/worst-10/best-10 statistics. The judge is fed the REAL context digest + the
 * suite's expected red-flags so it scores grounded, not by eye.
 */
import type { AIProvider } from "@/lib/ai/provider";
import { SUBJECTIVE_DIMS, type RubricScores, type SubjectiveDim, type AuditOutput } from "./types";

const JUDGE_SYSTEM = [
  "Sos un evaluador experto, estricto e imparcial, de un asesor financiero personal.",
  "Puntuás SOLO estas dimensiones subjetivas, cada una de 0 a 5 (0=pésimo, 5=excelente):",
  "relevancia, personalizacion, accionabilidad, prioridad, conciencia_temporal, explicacion, valor.",
  "Fundamentá con el CONTEXTO REAL y las BANDERAS ESPERADAS que se te dan; no puntúes a ojo.",
  'Respondé SOLO un objeto JSON con esas 7 claves y valores enteros 0-5. Sin texto extra.',
].join(" ");

const SLEEP_MS = 900;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function parseScores(text: string): RubricScores | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out = {} as RubricScores;
  for (const dim of SUBJECTIVE_DIMS) {
    const v = Number(obj[dim]);
    if (!Number.isFinite(v)) return null; // incomplete run → discard
    out[dim] = Math.max(0, Math.min(5, v));
  }
  return out;
}

export interface JudgeInput {
  prompt: string;
  reply: string;
  contextDigest: string;
  expectedRedFlags: string[];
}

/** Average the rubric over `runs` judge calls; null if the judge is unavailable/all fail. */
export async function judgeRubric(
  judge: AIProvider | undefined,
  input: JudgeInput,
  runs: number,
): Promise<RubricScores | null> {
  if (!judge) return null;
  const user = [
    `PREGUNTA DEL USUARIO:\n${input.prompt}`,
    `\nCONTEXTO FINANCIERO REAL (resumen):\n${input.contextDigest}`,
    input.expectedRedFlags.length
      ? `\nBANDERAS ESPERADAS (un buen asesor las respeta):\n- ${input.expectedRedFlags.join("\n- ")}`
      : "",
    `\nRESPUESTA DEL ASESOR A EVALUAR:\n${input.reply}`,
    `\nDevolvé el JSON de puntajes 0-5:`,
  ].join("\n");

  const acc = {} as Record<SubjectiveDim, number>;
  for (const d of SUBJECTIVE_DIMS) acc[d] = 0;
  let n = 0;
  for (let i = 0; i < runs; i++) {
    try {
      const res = await judge.chat({ system: JUDGE_SYSTEM, messages: [{ role: "user", content: user }], maxTokens: 2048 });
      const scores = parseScores(res.text);
      if (scores) {
        for (const d of SUBJECTIVE_DIMS) acc[d] += scores[d];
        n += 1;
      }
    } catch {
      // transient judge outage on the low-RPM -pro model → skip this run
    }
    if (i < runs - 1) await sleep(SLEEP_MS);
  }
  if (n === 0) return null;
  const avg = {} as RubricScores;
  for (const d of SUBJECTIVE_DIMS) avg[d] = Math.round((acc[d] / n) * 10) / 10;
  return avg;
}

// ---- Statistics ----

/** Composite score of one output = mean of its subjective dims (null rubric → null). */
export function compositeScore(o: AuditOutput): number | null {
  if (!o.rubric) return null;
  const vals = SUBJECTIVE_DIMS.map((d) => o.rubric![d]);
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
}

export interface RubricStats {
  count: number; // outputs with a rubric
  meanByDim: Record<SubjectiveDim, number>;
  overallMean: number;
  worst: { output: AuditOutput; score: number }[];
  best: { output: AuditOutput; score: number }[];
}

export function computeStats(outputs: AuditOutput[], topN = 10): RubricStats {
  const scored = outputs
    .map((o) => ({ output: o, score: compositeScore(o) }))
    .filter((x): x is { output: AuditOutput; score: number } => x.score !== null);
  const meanByDim = {} as Record<SubjectiveDim, number>;
  for (const d of SUBJECTIVE_DIMS) {
    const vals = scored.map((x) => x.output.rubric![d]);
    meanByDim[d] = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100 : 0;
  }
  const overallMean = scored.length
    ? Math.round((scored.reduce((s, x) => s + x.score, 0) / scored.length) * 100) / 100
    : 0;
  const byScore = [...scored].sort((a, b) => a.score - b.score);
  return {
    count: scored.length,
    meanByDim,
    overallMean,
    worst: byScore.slice(0, topN),
    best: byScore.slice(-topN).reverse(),
  };
}
