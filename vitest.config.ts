import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // tsconfig usa jsx:"preserve" (lo exige Next). El vite de vitest 4 (vite 8)
  // no transforma JSX por su cuenta y el import-analysis falla en los .tsx que
  // los tests importan vía barrels; plugin-react aplica el transform correcto.
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: true,
    // Bloquea el fetch a red EXTERNA (coingecko/fx/economic-indicators) → suite determinista, sin flaky
    // por timeouts de red. Localhost se permite; los tests que necesitan fetch lo stubbean por su cuenta.
    setupFiles: [fileURLToPath(new URL("./tests/setup/no-external-network.ts", import.meta.url))],
    // El default de vitest (5 s) es demasiado corto para esta suite y produce fallas FANTASMA: los
    // ~10 tests que ejercitan el `buildFinancialContext` REAL (ai-debt-currency, context-engine-levers,
    // ai-context-currency, security-menores, …) importan los barrels de dominio de verdad, y la
    // PRIMERA transformación de ese grafo cuesta ~10-15 s en frío. El costo es del transform, no de
    // una aserción lenta: es one-time por worker, así que cae sobre el test que toque importar
    // primero — por eso el subconjunto que falla cambia entre corridas y en CI (caché caliente) no
    // falla nunca. Subirlo NO tapa cuelgues: una promesa colgada no resuelve ni con 30 s ni con 5.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // 'server-only' no resuelve en node; en tests es un no-op (su única función
      // es romper el build si se importa en cliente). Permite probar fns puras.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
