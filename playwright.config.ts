import { defineConfig } from "@playwright/test";

/**
 * E2E smoke (revisión F6). Corre contra el dev server local con el usuario de
 * prueba del sandbox. En CI: el job levanta `npm run dev` (webServer abajo lo
 * reutiliza si ya existe). Selectores por rol/texto en español.
 */
export default defineConfig({
  testDir: "tests/e2e",
  // Fuera del árbol del proyecto: si Playwright escribe traces/screenshots
  // dentro, el watcher de Next dev recompila en bucle y mata las server
  // actions en vuelo (login colgado en "Un momento…").
  outputDir: "/tmp/compound-e2e-results",
  reporter: [["list"]],
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
