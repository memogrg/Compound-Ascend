import { defineConfig, devices } from "@playwright/test";

/**
 * Config APARTE para la auditoría de accesibilidad. No toca `playwright.config.ts` ni el
 * smoke E2E: ese corre contra `npm run dev` en :3000 y lo usa CI; esta corre contra el
 * servidor CONGELADO en :3001 (`npm run qa:start`), que es el mismo que toma las capturas
 * visuales — así el inventario y la línea base miran exactamente la misma pantalla.
 *
 * Sin `webServer` a propósito: el servidor se levanta a mano con su QA_FREEZE, porque
 * arrancarlo desde acá sin congelar daría fechas y precios distintos en cada corrida.
 *
 *   Terminal A:  QA_FREEZE=2026-09-18T18:00:00Z npm run qa:start
 *   Terminal B:  E2E_EMAIL=… E2E_PASSWORD=… npm run test:a11y
 */
export default defineConfig({
  testDir: "tests/a11y",
  outputDir: "/tmp/compound-a11y-results",
  reporter: [["list"]],
  timeout: 120_000,
  // Un solo worker: las rutas comparten sesión y el servidor es uno solo.
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.A11Y_BASE_URL ?? "http://localhost:3001",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium" }],
});
