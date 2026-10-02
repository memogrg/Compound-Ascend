/**
 * La leyenda y el rótulo del mes en curso NO pueden ir dentro del lienzo.
 *
 * `.cf-lienzo` tiene altura FIJA (`alto + reservaSuperior`): es lo que hace que los cuatro
 * estados del marco midan lo mismo y que la página no dé un salto al cargar. Todo lo que un
 * gráfico pinte debajo de su trazado se sale de esa caja — a 1280 «Parcial» caía fuera de la
 * tarjeta, y a 768 y 390 la segunda fila de la leyenda y la nota quedaban tapadas por la tarjeta
 * siguiente (decisión 48).
 *
 * El marco tiene un slot `leyenda` que va FUERA del lienzo, y ahí es donde va. Un componente de
 * gráfico no puede decidir cuánto mide lo que va debajo del lienzo; el marco sí.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ChartFrame,
  HistoricoGasto,
  LeyendaHistoricoGasto,
  tablaHistoricoGasto,
} from "@/components/charts/core";

const DATOS = [
  { label: "jul", real: 900_000, presupuesto: 1_000_000 },
  { label: "ago", real: 1_200_000, presupuesto: 1_000_000 },
  { label: "sept", real: 400_000, presupuesto: 1_000_000 },
];
const EN_CURSO = { dia: 18, diasDelMes: 30 };

/** El trozo de HTML que hay entre la apertura de `.cf-lienzo` y su cierre. */
function dentroDelLienzo(html: string): string {
  const i = html.indexOf('class="cf-lienzo"');
  if (i < 0) return "";
  // El lienzo es el último bloque del marco, así que basta con todo lo que sigue.
  return html.slice(i);
}

describe("la leyenda vive fuera del lienzo", () => {
  const html = renderToStaticMarkup(
    <ChartFrame
      titulo="Histórico de gastos"
      descripcion="Gasto real contra presupuesto, por mes."
      estado="datos"
      tabla={tablaHistoricoGasto(DATOS, "CRC", EN_CURSO)}
      leyenda={<LeyendaHistoricoGasto datos={DATOS} enCurso={EN_CURSO} />}
    >
      <HistoricoGasto datos={DATOS} moneda="CRC" enCurso={EN_CURSO} />
    </ChartFrame>,
  );

  it("la leyenda y la nota se renderizan", () => {
    // Si no estuvieran, el test de abajo pasaría por la razón equivocada.
    expect(html).toContain("cf-leyenda");
    expect(html).toContain("cf-en-curso");
    expect(html, "«Parcial» solo con un mes a medias").toContain("Parcial");
  });

  it("ninguna de las dos cae dentro de `.cf-lienzo`", () => {
    const lienzo = dentroDelLienzo(html);
    expect(lienzo, "el marco tiene lienzo").not.toBe("");
    expect(lienzo, "la leyenda está dentro del lienzo").not.toContain("cf-leyenda");
    expect(lienzo, "la nota del mes en curso está dentro del lienzo").not.toContain("cf-en-curso");
  });

  it("el gráfico por sí solo no pinta ninguna de las dos", () => {
    // La garantía de verdad: aunque alguien lo use sin marco, el gráfico no vuelve a traerse la
    // leyenda consigo. Es lo que impide que el defecto reaparezca en un sitio nuevo.
    const solo = renderToStaticMarkup(
      <HistoricoGasto datos={DATOS} moneda="CRC" enCurso={EN_CURSO} />,
    );
    expect(solo).not.toContain("cf-leyenda");
    expect(solo).not.toContain("cf-en-curso");
  });
});
