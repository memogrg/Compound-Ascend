/**
 * La bandera que apaga la animación de los gráficos en las capturas.
 *
 * Hoy no cambia ninguna pantalla: el producto ya quiere la animación de Recharts apagada, y el
 * núcleo ya la apaga. Lo que la bandera compra no es un comportamiento nuevo — es que **no pueda
 * dejar de ser cierto sin que las capturas se enteren**. De ahí que se compruebe lo que se
 * comprueba: que la decisión viva en UN sitio, que la bandera la fuerce, y que esté declarada
 * como bandera de interfaz para que el diff se niegue si base y rama no coinciden.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BANDERAS_UI } from "@/lib/qa/banderas";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

/** Todo componente del árbol de gráficos que dibuja una serie de Recharts. */
const CON_SERIE = [
  "src/components/charts/area-chart.tsx",
  "src/components/charts/line-chart.tsx",
  "src/components/charts/donut-chart.tsx",
  "src/components/charts/core/historico-gasto.tsx",
];

describe("bandera de animación en modo QA", () => {
  it("está declarada como bandera de INTERFAZ", () => {
    // Sin esto no entra al manifiesto, y base y rama podrían compilarse distinto sin que nada
    // lo note hasta que una de las dos empiece a animar.
    expect([...BANDERAS_UI]).toContain("NEXT_PUBLIC_QA_SIN_ANIMACION");
  });

  it("la decide UNA sola constante, y la bandera la fuerza", () => {
    const theme = leer("src/components/charts/core/theme.ts");
    expect(theme).toContain("NEXT_PUBLIC_QA_SIN_ANIMACION");
    expect(theme, "la bandera fuerza el apagado").toMatch(
      /NEXT_PUBLIC_QA_SIN_ANIMACION === "1"\s*\?\s*false/,
    );
  });

  it("ningún gráfico escribe el valor a mano", () => {
    // Cuatro `false` repartidos son cuatro sitios donde alguien puede poner `true` sin que la
    // bandera lo alcance. Todos leen la constante.
    const culpables: string[] = [];
    for (const f of CON_SERIE) {
      const src = leer(f);
      if (/isAnimationActive=\{(true|false)\}/.test(src)) culpables.push(f);
      if (src.includes("isAnimationActive") && !src.includes("ANIMACION_ACTIVA"))
        culpables.push(`${f} (no usa la constante)`);
    }
    expect(culpables, `escriben la animación a mano: ${culpables.join(", ")}`).toEqual([]);
  });
});
