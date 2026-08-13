/**
 * F2 library end-to-end: runs the diverse persona library through the behavioral
 * engine over a 1-month virtual window, asserting the core invariants hold for
 * EVERY persona. Gated on SUPABASE_TEST_* (self-skips without a test DB, like
 * tests/rls); NOT part of `npm test` (root vitest include is tests/** + src/**).
 * Run with `npm run sim`. `SIM_ONLY=<key>` runs one persona; `SIM_MONTHS=<n>`
 * widens the window (default 1).
 */
import { describe, it, expect } from "vitest";
import { SIM_DB_READY } from "../env";
import { runLibrary } from "./runner";

const months = Number(process.env.SIM_MONTHS ?? "1") || 1;
const only = process.env.SIM_ONLY;

describe.skipIf(!SIM_DB_READY)("Simulador · librería de personas (motor conductual)", () => {
  it(
    "mantiene los invariantes núcleo para cada persona en la ventana de mes",
    async () => {
      const results = await runLibrary({ nowStamp: Date.now(), months, only });
      expect(results.length).toBeGreaterThan(0);

      // Always surface each persona's structured journal (green or red).
      for (const r of results) {
        console.log(`\n===== ${r.displayName} (${r.persona}) · ${r.checks} checks =====\n${r.log.format()}`);
      }

      const failing = results.filter((r) => r.failures > 0);
      const detail = failing
        .map(
          (r) =>
            `${r.persona}:\n` +
            r.log.failures.map((f) => `  - ${f.name}: ${f.detail}`).join("\n"),
        )
        .join("\n");
      expect(
        failing.map((r) => r.persona),
        `personas con invariantes violados:\n${detail}`,
      ).toEqual([]);

      for (const r of results) expect(r.checks).toBeGreaterThan(0);
    },
    180_000,
  );
});
