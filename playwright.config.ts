import { defineConfig } from "@playwright/test";

/**
 * E2E smoke (revisión F6). Corre contra un BUILD, con el usuario de prueba del sandbox.
 * Selectores por rol/texto en español.
 *
 * ── POR QUÉ NO `next dev` ───────────────────────────────────────────────────
 * Era `npm run dev`, y un smoke contra `next dev` no prueba lo que se despliega:
 *
 *  · **StrictMode corre los efectos dos veces.** En dev, la limpieza del segundo montaje
 *    desconecta los observadores y limpia los temporizadores, y las guardas de «ya corrió»
 *    saltan la segunda pasada: ninguna animación por scroll llega a dispararse. Lo aprendimos
 *    en la landing, donde el gráfico y los reveals no se mueven en dev y sí en producción.
 *  · **Las `NEXT_PUBLIC_*` se INLINEAN al compilar.** En dev se leen en cada petición, así que
 *    una bandera mal puesta pasa desapercibida; en producción queda horneada. El job `nav-v2`
 *    ya compilaba a propósito por esto mismo.
 *  · **El compilador es otro** (sin minificar, sin tree-shaking, con overlay de errores), y
 *    hasta el DOM: el `nextjs-portal` de las devtools obligó a excluir un «intruso» del smoke.
 *
 * `reuseExistingServer` sigue activo FUERA de CI —quien ya tiene algo en :3000 lo aprovecha—
 * pero en CI nunca: ahí el job compila y sirve su propio artefacto, sin reutilizar nada.
 * `con-env.mjs` resuelve los `.env*` contra la raíz del repo, para que el build funcione igual
 * desde un `git worktree` (que no los lleva); en CI no hay `.env*` y pasa el entorno tal cual.
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
    command:
      "node scripts/dev/con-env.mjs npm run build && node scripts/dev/con-env.mjs npm run start -- -p 3000",
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    // El build entra en la ventana: en el runner tarda ~3 min, y 120 s dejaban el job en
    // rojo por «timeout» cuando lo que faltaba era compilar.
    timeout: 600_000,
  },
});
