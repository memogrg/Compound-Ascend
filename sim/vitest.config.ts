import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Dedicated config for the simulation runner. Separate from the root vitest
 * config on purpose: its `include` is ONLY `sim/**`, so `npm test` (root config,
 * tests/** + src/**) never runs the DB-bound slice. Run with `npm run sim`.
 *
 * Mirrors the root aliases (`@` → src, `server-only` → no-op stub) so the app
 * services resolve in the node test env, and adds `sim/setup.ts` (WebSocket
 * polyfill + prod guardrail) before any Supabase client is created.
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    root: repoRoot,
    environment: "node",
    include: ["sim/**/*.test.ts"],
    setupFiles: [fileURLToPath(new URL("./setup.ts", import.meta.url))],
    globals: true,
    // Single persona on one ordered virtual timeline → run serially.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
      "server-only": fileURLToPath(new URL("../tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
