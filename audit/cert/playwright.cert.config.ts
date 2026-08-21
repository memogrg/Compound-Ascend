/**
 * Cert E2E config (separate from the root smoke's playwright.config.ts, which stays
 * untouched). Runs the reference journey on web-desktop AND the /m mobile shell.
 *
 * SAFETY — the browser must talk to the TEST DB, never prod:
 *  · Dedicated port 3100 + reuseExistingServer:false → always a fresh dev server, never
 *    an existing `npm run dev` that might be pointing at prod on 3000.
 *  · webServer.env injects the TEST Supabase creds. Playwright spawns the server with
 *    `{ ...process.env, ...webServer.env }`, and Next does NOT override an already-set
 *    process.env var with .env.local — so the injected TEST url WINS over the prod url
 *    baked into .env.local. This override is then PROVEN empirically in global.setup.ts
 *    by asserting the issued auth cookie is `sb-<testRef>-…` (and never `sb-<prodRef>-…`).
 *
 * Layout: projects/oracle live here; journeys in journeys/*.spec.ts; POMs in pods/;
 * evidence + storageState under audit/ (gitignored). Run: `npm run cert:e2e`.
 */
import { defineConfig } from "@playwright/test";
import { TEST } from "./lib/env";
import { IPHONE, ANDROID } from "./lib/devices";
import { WEB_STORAGE, MOBILE_STORAGE } from "./lib/context";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const JOURNEYS = /journeys\/.+\.spec\.ts$/;

export default defineConfig({
  testDir: __dirname,
  // Outside the project tree: Next dev's watcher recompiles in a loop if Playwright
  // writes its traces/results inside it (same reason as the root smoke config).
  outputDir: "/tmp/compound-cert-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"], ["html", { outputFolder: "/tmp/compound-cert-report", open: "never" }]],
  expect: { timeout: 15_000 },
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
      testMatch: JOURNEYS,
      dependencies: ["setup"],
      metadata: { surface: "web" },
      use: { viewport: { width: 1440, height: 900 }, storageState: WEB_STORAGE },
    },
    {
      name: "mobile-iphone",
      testMatch: JOURNEYS,
      dependencies: ["setup"],
      metadata: { surface: "mobile" },
      use: { ...IPHONE, storageState: MOBILE_STORAGE },
    },
    {
      name: "mobile-android",
      testMatch: JOURNEYS,
      dependencies: ["setup"],
      metadata: { surface: "mobile" },
      use: { ...ANDROID, storageState: MOBILE_STORAGE },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // The override that points the dev server at the TEST project (never prod).
      NEXT_PUBLIC_SUPABASE_URL: TEST.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: TEST.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: TEST.serviceKey,
      // NOT "test": appEnvSchema only allows development|staging|production, and the AI routes call
      // getServerEnv() (via corsHeaders/assertTrustedOrigin) which validates the FULL server env —
      // an invalid APP_ENV 500s every /api/assistant/* call. "development" is the correct non-prod
      // value (nothing in src/ keys off "test"; consumers only check === "production").
      APP_ENV: "development",
      PORT: String(PORT),
      // The AI API routes (/api/assistant/*) enforce assertTrustedOrigin against ALLOWED_ORIGINS
      // (default localhost:3000); the harness dev server is on 3100, so a same-origin POST would
      // 403 without this. The server-action journeys never hit a CORS-guarded route — the receipt
      // scan + chat do. (Not prod-relevant: prod sets its own ALLOWED_ORIGINS.)
      ALLOWED_ORIGINS: BASE_URL,
      // AI DETERMINISM: force the StubProvider for the whole default run. `getProvider()`
      // (lib/ai/orchestrator.ts) falls to StubProvider when GEMINI_API_KEY is absent — so an
      // empty key here overrides whatever the machine's .env.local holds and makes the AI
      // journeys (receipt scan, advisor chat) 100% deterministic and network-free. The env
      // schema pins AI_PROVIDER to "gemini", so the key — not the provider name — is the lever.
      // The REAL-vision path is exercised separately by the gated live config (never here).
      GEMINI_API_KEY: "",
    },
  },
});
