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
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
