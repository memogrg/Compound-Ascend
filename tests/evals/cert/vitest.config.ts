import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Dedicated config for the LIVE AI audit. Mirrors sim/vitest.config.ts (root aliases +
 * `sim/setup.ts`: WebSocket polyfill + prod guardrail before any Supabase client) but its
 * `include` is ONLY the live audit spec, so `npm test` (root config) never runs it and the
 * deterministic floor (ai-audit.det.test.ts) still runs there. Run with `npm run ai-audit`.
 */
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    root: repoRoot,
    environment: "node",
    include: ["tests/evals/cert/ai-audit.live.test.ts"],
    setupFiles: [fileURLToPath(new URL("../../../sim/setup.ts", import.meta.url))],
    globals: true,
    fileParallelism: false,
    testTimeout: 1_800_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../../../tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
