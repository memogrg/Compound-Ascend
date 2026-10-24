/**
 * Los ids de `<defs>` tienen que ser únicos ENTRE INSTANCIAS.
 *
 * Es el fallo que solo aparece cuando alguien pone dos gráficos en la misma página —justo lo
 * que hace `/dev/ui`—: si los dos declaran `#grad-1`, el segundo le roba el degradado al
 * primero y uno de los dos se queda con el área plana.
 *
 * Se renderiza con `react-dom/server`, que corre en el entorno `node` de vitest: no hace
 * falta jsdom ni RTL para comprobar el marcado.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";

import { GradientDefs, useGradientIds } from "@/components/charts/core/gradient-defs";
import { GlowFilter, useGlowId } from "@/components/charts/core/glow-filter";
import type { SerieDef } from "@/components/charts/core/theme";

const SERIES: SerieDef[] = [
  { clave: "real", etiqueta: "Real", color: "var(--chart-1)", marca: "area" },
  { clave: "meta", etiqueta: "Meta", color: "var(--chart-6)", marca: "linea" },
];

function UnGrafico() {
  const ids = useGradientIds(SERIES);
  const glow = useGlowId();
  return (
    <svg>
      <GradientDefs series={SERIES} ids={ids} />
      <GlowFilter id={glow} />
    </svg>
  );
}

function idsDe(html: string): string[] {
  return [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
}

describe("ids de los defs", () => {
  it("dos gráficos en la misma página no comparten ni un id", () => {
    const html = renderToStaticMarkup(
      <div>
        <UnGrafico />
        <UnGrafico />
      </div>,
    );
    const ids = idsDe(html);
    // 2 series × 2 gráficos + 1 filtro × 2 gráficos
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size, "ids repetidos entre instancias").toBe(ids.length);
  });

  it("dentro de un gráfico, cada serie tiene el suyo", () => {
    const html = renderToStaticMarkup(<UnGrafico />);
    const ids = idsDe(html);
    expect(new Set(ids).size).toBe(3);
    expect(ids.filter((i) => i.startsWith("cf-grad-"))).toHaveLength(2);
    expect(ids.filter((i) => i.startsWith("cf-glow-"))).toHaveLength(1);
  });

  it("el `url(#…)` del área apunta al id de SU instancia", () => {
    // Quien consume `ids[clave]` recibe el id correcto: si el mapa se construyera con un
    // contador global, dos gráficos apuntarían al mismo degradado.
    const html = renderToStaticMarkup(
      <div>
        <UnGrafico />
        <UnGrafico />
      </div>,
    );
    const grads = idsDe(html).filter((i) => i.startsWith("cf-grad-"));
    expect(grads.filter((i) => i.endsWith("-real"))).toHaveLength(2);
    expect(new Set(grads.filter((i) => i.endsWith("-real"))).size).toBe(2);
  });
});
