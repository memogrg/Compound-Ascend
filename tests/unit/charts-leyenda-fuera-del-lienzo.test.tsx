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

/**
 * El trozo de HTML que hay entre la apertura de `.cf-lienzo` y su cierre, contando `<div>`.
 *
 * Antes devolvía «todo lo que sigue», con el argumento de que el lienzo era el último bloque del
 * marco. Dejó de ser verdad: el marco tiene ahora un slot `pie` DESPUÉS del lienzo, así que ese
 * atajo contaría como «dentro» justo lo que esta guarda existe para vigilar que esté fuera.
 */
function dentroDelLienzo(html: string): string {
  const i = html.indexOf('class="cf-lienzo"');
  if (i < 0) return "";
  const abre = html.lastIndexOf("<div", i);
  let prof = 0;
  for (let k = abre; k < html.length; k++) {
    if (html.startsWith("<div", k)) prof++;
    else if (html.startsWith("</div>", k)) {
      prof--;
      if (prof === 0) return html.slice(abre, k + 6);
    }
  }
  // Sin cierre equilibrado no se puede afirmar nada: devolver el resto haría pasar la guarda por
  // la razón equivocada.
  return html.slice(abre);
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

/**
 * Los dos slots nuevos del marco (26.1) viven también fuera del lienzo.
 *
 * `acciones` va en la cabecera y `pie` debajo de la tabla, y los dos por la misma razón que la
 * leyenda: el lienzo tiene altura fija, y lo que se pinte dentro por encima de su alto se sale de
 * la tarjeta (decisión 48). `pie` es el que importa vigilar, porque es el primer hijo del marco que
 * va DESPUÉS del lienzo — y es lo que invalidó el atajo del delimitador de arriba.
 */
describe("`acciones` y `pie` tampoco entran en el lienzo", () => {
  const html = renderToStaticMarkup(
    <ChartFrame
      titulo="Composición"
      descripcion="Reparto por bloque."
      estado="datos"
      tabla={tablaHistoricoGasto(DATOS, "CRC", EN_CURSO)}
      leyenda={<LeyendaHistoricoGasto datos={DATOS} enCurso={EN_CURSO} />}
      acciones={<a href="/mi-base-financiera">marca-de-acciones</a>}
      pie={<span>marca-del-pie</span>}
      disposicionLeyenda="lateral"
    >
      <HistoricoGasto datos={DATOS} moneda="CRC" enCurso={EN_CURSO} />
    </ChartFrame>,
  );

  it("los dos se renderizan", () => {
    expect(html, "sin esto, lo de abajo pasaría por la razón equivocada").toContain(
      "marca-de-acciones",
    );
    expect(html).toContain("marca-del-pie");
    expect(html).toContain("cf-acciones");
    expect(html).toContain("cf-pie");
  });

  it("ninguno cae dentro de `.cf-lienzo`", () => {
    const lienzo = dentroDelLienzo(html);
    expect(lienzo, "el marco tiene lienzo").not.toBe("");
    expect(lienzo, "el lienzo quedó sin cerrar: el delimitador no delimita").toContain("</div>");
    expect(lienzo, "`acciones` está dentro del lienzo").not.toContain("marca-de-acciones");
    expect(lienzo, "`pie` está dentro del lienzo").not.toContain("marca-del-pie");
    expect(lienzo, "la leyenda está dentro del lienzo").not.toContain("cf-leyenda");
  });

  it("en disposición lateral el lienzo y la leyenda son hermanos de una fila", () => {
    // Lo que hace que el reparto lateral no toque el alto del lienzo: la leyenda está AL LADO, no
    // dentro. Si alguien la metiera dentro para «que quede alineada», el alto fijo dejaría de valer.
    expect(html).toContain('data-leyenda="lateral"');
    expect(html).toContain('class="cf-lateral"');
    expect(html).toContain('class="cf-leyenda-lado"');
    const fila = html.slice(html.indexOf('class="cf-lateral"'));
    expect(
      fila.indexOf("cf-lienzo"),
      "el lienzo tiene que venir antes que la leyenda en la fila",
    ).toBeLessThan(fila.indexOf("cf-leyenda-lado"));
  });

  it("sin los slots, el marco no pinta sus envoltorios", () => {
    const pelado = renderToStaticMarkup(
      <ChartFrame
        titulo="Composición"
        descripcion="Reparto por bloque."
        estado="datos"
        tabla={tablaHistoricoGasto(DATOS, "CRC", EN_CURSO)}
      >
        <HistoricoGasto datos={DATOS} moneda="CRC" enCurso={EN_CURSO} />
      </ChartFrame>,
    );
    expect(pelado, "un marco sin nota al pie no debería traer la caja vacía").not.toContain(
      "cf-pie",
    );
    expect(pelado, "sin `disposicionLeyenda` no se declara contenedor").not.toContain(
      'data-leyenda="lateral"',
    );
  });
});
