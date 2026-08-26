/**
 * Live AI audit — GATED on RUN_LIVE_EVALS + GEMINI_API_KEY + SUPABASE_TEST_*. Seeds the
 * deep personas, calls the REAL advisor (Gemini) at month1/month6, runs the deterministic
 * hard checks + the graded judge, and writes tests/evals/cert/out/ai-audit-report.md.
 * Audit-first: it SURFACES everything (contradictions/grounding as ❌ in the report) and
 * does not hard-fail on a single finding — Memo reviews the full report. Run:
 *   RUN_LIVE_EVALS=1 EVAL_JUDGE=1 npm run ai-audit
 * (needs GEMINI_API_KEY + SUPABASE_TEST_*). Cost is tunable: AI_AUDIT_N, AI_AUDIT_PERSONAS.
 */
// El juez -pro (gemini-3.1-pro-preview) es lento y timeouteaba a 20s, invalidando parte de
// la rúbrica. Aquí NO hay maxDuration de Vercel, así que subimos el timeout a 60s (respeta un
// override explícito). Debe ir ANTES de crear cualquier GeminiProvider (lee la env al cargar).
process.env.GEMINI_TIMEOUT_MS ??= "60000";

import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { RUN_LIVE, makeModelProvider, makeJudgeProvider } from "../eval-harness";
import { SIM_DB_READY } from "../../../sim/env";
import { runAiAudit } from "./run";
import { renderMd, renderConsole, summarize } from "./report";

const GATED = RUN_LIVE && SIM_DB_READY;

describe.skipIf(!GATED)("Auditoría de IA · asesor real (gated)", () => {
  it(
    "audita las personas profundas y escribe el reporte",
    async () => {
      const provider = makeModelProvider();
      if (!provider) {
        // RUN_LIVE set but no GEMINI_API_KEY → nothing to test against.
        console.warn("[ai-audit] sin GEMINI_API_KEY → omitido");
        return;
      }
      const judge = makeJudgeProvider(); // undefined if EVAL_JUDGE not set → rubric skipped
      const N = Number(process.env.AI_AUDIT_N ?? 3) || 3;
      const personas = process.env.AI_AUDIT_PERSONAS?.split(",").map((s) => s.trim()).filter(Boolean);

      const res = await runAiAudit({ nowStamp: Date.now(), provider, judge, N, personas });

      const md = renderMd(res, { generatedAt: new Date().toISOString() });
      const outDir = join(fileURLToPath(new URL(".", import.meta.url)), "out");
      writeFileSync(join(outDir, "ai-audit-report.md"), md, "utf8");

      const s = summarize(res);
      console.log(`${renderConsole(res)} → tests/evals/cert/out/ai-audit-report.md`);
      if (s.contradictions > 0 || s.grounding > 0) {
        console.warn(`[ai-audit] ⚠️ EVIDENCIA DURA: ${s.contradictions} contradicciones, ${s.grounding} grounding — ver el reporte.`);
      }

      expect(res.outputs.length).toBeGreaterThan(0);
    },
    // 80 min: el timeout per-test del it() OVERRIDEA el config; con las suites confrontacion/
    // highlights (~35 outputs × juez -pro ×3 + rescate) el run supera los 30 min.
    4_800_000,
  );
});
