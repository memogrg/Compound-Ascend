/**
 * F1c vertical slice: the end-to-end assertion. Gated on the TEST DB creds
 * (`SUPABASE_TEST_*`) — it self-skips without them, exactly like `tests/rls`, so
 * the normal battery stays green on a machine with no test DB. It is NOT part of
 * `npm test` (the root vitest config includes only tests/** + src/**); run it with
 * `npm run sim`.
 */
import { describe, it, expect } from "vitest";
import { SIM_DB_READY } from "./env";
import { runVerticalSlice } from "./runner";

const SEED = 0xc0ffee;

describe.skipIf(!SIM_DB_READY)("Simulador · rebanada vertical (persona control-excelente)", () => {
  it(
    "mantiene todos los invariantes núcleo a lo largo del ciclo",
    async () => {
      // nowStamp: the REAL wall clock, only to keep the synthetic email unique per
      // run. The simulated timeline is the VIRTUAL clock inside the runner.
      const result = await runVerticalSlice({ seed: SEED, nowStamp: Date.now() });

      // Always surface the structured journal so a run (green or red) is auditable.
      console.log("\n" + result.log.format());

      const detail = result.log.failures.map((f) => `- ${f.name}: ${f.detail}`).join("\n");
      expect(result.failures, `invariantes violados:\n${detail}`).toBe(0);
      expect(result.log.checks.length).toBeGreaterThan(0);
    },
    60_000,
  );
});
