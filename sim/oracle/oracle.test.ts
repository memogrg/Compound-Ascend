/**
 * Oracle financiero (gated on SUPABASE_TEST_*). Seeds the scenarios against the test DB,
 * re-derives every metric independently, and compares vs the real services. FAILS on any
 * CRITICAL (core identity broken OR non-finite value); characterization divergences are
 * reported, not blocking. On a critical, the FULL report is printed (not just the assert).
 * Writes sim/oracle/out/oracle-report.md. Run with `npm run oracle`. Local (Memo).
 */
import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { SIM_DB_READY } from "../env";
import { runOracle } from "./run";
import { renderMd, renderConsole, summarize } from "./report";

describe.skipIf(!SIM_DB_READY)("Oracle financiero · re-derivación independiente vs servicios", () => {
  it(
    "identidades núcleo intactas y ningún valor no-finito (caracterización se reporta)",
    async () => {
      const nowStamp = Date.now();
      const discrepancies = await runOracle({ nowStamp });

      const md = renderMd(discrepancies, { generatedAt: new Date().toISOString() });
      const outDir = join(fileURLToPath(new URL(".", import.meta.url)), "out");
      writeFileSync(join(outDir, "oracle-report.md"), md, "utf8");

      const s = summarize(discrepancies);
      if (s.critical > 0) {
        // Ante ❌ CRÍTICO: reporte COMPLETO, no solo el assert.
        console.error(renderConsole(discrepancies));
      }
      console.log(
        `[oracle] ${s.critical} críticos · ${s.characterization} caracterización · ${s.ok} identidades OK ` +
          `(${s.total} checks) → sim/oracle/out/oracle-report.md`,
      );

      expect(
        s.critical,
        "diferencia financiera CRÍTICA (identidad núcleo rota o valor NaN/Infinity) — ver el reporte completo arriba",
      ).toBe(0);
    },
    600_000,
  );
});
