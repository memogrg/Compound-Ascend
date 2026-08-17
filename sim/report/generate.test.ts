/**
 * Report generator (F4). Gated on SUPABASE_TEST_* (self-skips without a test DB).
 * Runs the whole library (7 personas) + the DCA persona, then writes report.html +
 * report.md to sim/report/out/ (gitignored). Run with `npm run sim:report`.
 * `SIM_MONTHS=<n>` sets the window (default 6).
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { SIM_DB_READY } from "../env";
import { runLibrary } from "../library/runner";
import { runDcaPersona } from "../library/dca/dca-runner";
import { renderHtml, renderMd } from "./reporter";
import type { RunResult } from "./types";

const months = Number(process.env.SIM_MONTHS ?? "6") || 6;

describe.skipIf(!SIM_DB_READY)("Simulador · genera el reporte (HTML + MD)", () => {
  it(
    "corre las 8 personas y escribe report.html + report.md en out/",
    async () => {
      const nowStamp = Date.now();
      const library = await runLibrary({ nowStamp, months });
      const dca = await runDcaPersona({ nowStamp, months });
      const runs: RunResult[] = [...library, dca];

      const html = renderHtml(runs, { generatedAt: new Date().toISOString() });
      const md = renderMd(runs);

      const outDir = join(fileURLToPath(new URL(".", import.meta.url)), "out");
      writeFileSync(join(outDir, "report.html"), html, "utf8");
      writeFileSync(join(outDir, "report.md"), md, "utf8");
      console.log(`Reporte escrito en ${outDir}: report.html + report.md (${runs.length} personas)`);

      expect(runs.length).toBe(library.length + 1);
      expect(html).toContain("<!doctype html>");
      expect(md).toContain("# Simulador");
    },
    600_000,
  );
});
