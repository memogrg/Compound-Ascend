/**
 * GATED LIVE config — the ONLY place the harness talks to the real Gemini vision model. Kept
 * SEPARATE from playwright.cert.config.ts (which forces the stub with GEMINI_API_KEY:"") so the
 * default run stays 100% deterministic and network-free; nothing here can affect it.
 *
 * Scope: web-desktop ONLY, and ONLY the live receipt spec (audit/cert/live/*.live.spec.ts — a dir
 * the default JOURNEYS glob never matches). Same TEST-DB safety as the default config. The dev
 * server boots with the REAL key (from .env.local via lib/env) + AI_PROVIDER=gemini → getProvider()
 * returns the GeminiProvider, so the scan pre-populates the card from real vision.
 *
 * Run: `npm run cert:e2e:live` (needs GEMINI_API_KEY in .env.local; the spec self-SKIPS without it).
 */
import { defineConfig } from "@playwright/test";
import { TEST } from "./lib/env";
import { WEB_STORAGE } from "./lib/context";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const LIVE_JOURNEYS = /live\/.+\.live\.spec\.ts$/;

export default defineConfig({
  testDir: __dirname,
  outputDir: "/tmp/compound-cert-live-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"], ["html", { outputFolder: "/tmp/compound-cert-live-report", open: "never" }]],
  expect: { timeout: 20_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts$/,
      teardown: "cleanup",
      use: { viewport: { width: 1440, height: 900 } },
    },
    { name: "cleanup", testMatch: /global\.teardown\.ts$/ },
    {
      name: "web-desktop",
      testMatch: LIVE_JOURNEYS,
      dependencies: ["setup"],
      metadata: { surface: "web" },
      use: { viewport: { width: 1440, height: 900 }, storageState: WEB_STORAGE },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: TEST.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: TEST.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: TEST.serviceKey,
      // "development" (not "test"): appEnvSchema rejects "test" and the AI routes validate the full
      // server env via getServerEnv() — see the default config for the full rationale.
      APP_ENV: "development",
      PORT: String(PORT),
      // Same reason as the default config: the /api/assistant/* routes gate on ALLOWED_ORIGINS.
      ALLOWED_ORIGINS: BASE_URL,
      // The REAL vision path: a real key (from .env.local) + the gemini provider. Absent → "" →
      // the dev server runs stub and the spec self-skips (never a false green/red).
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
    },
  },
});
