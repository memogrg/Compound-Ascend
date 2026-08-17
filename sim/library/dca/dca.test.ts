/**
 * F3a-DCA end-to-end: a QUOTED recurring holding auto-contributing each month with a
 * MOCKED price, over a multi-month virtual window. Validates 1 contribution/month +
 * the merge + linked gasto + portfolio_snapshots + inversiones vs-mes, and
 * characterizes the known investment_transactions gap (issue #655). Gated on
 * SUPABASE_TEST_* (self-skips without a test DB); NOT part of `npm test`. Run with
 * `npm run sim`. `SIM_MONTHS=<n>` sets the window (default 6).
 */
import { describe, it, expect } from "vitest";
import { SIM_DB_READY } from "../../env";
import { runDcaPersona } from "./dca-runner";

const months = Number(process.env.SIM_MONTHS ?? "6") || 6;

describe.skipIf(!SIM_DB_READY)("Simulador · DCA (holding cotizado recurrente, precio mockeado)", () => {
  it(
    "auto-registra 1 contribución por mes y mantiene invariantes + evolución",
    async () => {
      const result = await runDcaPersona({ nowStamp: Date.now(), months });

      console.log(`\n===== ${result.persona} · ${result.checks} checks =====\n${result.log.format()}`);

      const detail = result.log.failures.map((f) => `  - ${f.name}: ${f.detail}`).join("\n");
      expect(result.failures, `invariantes DCA violados:\n${detail}`).toBe(0);
      expect(result.checks).toBeGreaterThan(0);
    },
    300_000,
  );
});
