/**
 * El gráfico de línea pasa al marco (26.2): quién pinta qué.
 *
 * Lo que se fija acá no es que «funcione», es el reparto. El gráfico pintaba tres cosas que no le
 * tocan —su leyenda dentro del lienzo, su propio estado vacío y un `role="img"` con un rótulo
 * genérico—, y mientras siga pintándolas el marco no puede cumplir lo que promete: que los cuatro
 * estados midan lo mismo y que la figura tenga un solo nombre.
 */
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ChartFrame,
  LeyendaSeries,
  describirGrafico,
  tablaDeDatos,
  type SerieDef,
} from "@/components/charts/core";
import { PremiumLineChart } from "@/components/charts/line-chart";
import { formatMoney } from "@/lib/format";

const SERIES: SerieDef[] = [
  { clave: "Ingresos", etiqueta: "Ingresos", color: "var(--pos)", marca: "linea" },
  { clave: "Gastos", etiqueta: "Gastos", color: "var(--c-expense)", marca: "linea" },
  { clave: "Flujo libre", etiqueta: "Flujo libre", color: "var(--info)", marca: "linea" },
];

const DATOS = [
  { x: "jul", Ingresos: 1_800_000, Gastos: 1_200_000, "Flujo libre": 600_000 },
  { x: "ago", Ingresos: 1_900_000, Gastos: 1_500_000, "Flujo libre": 400_000 },
  { x: "sep", Ingresos: 1_700_000, Gastos: 1_750_000, "Flujo libre": -50_000 },
];

/** El formateador de la app, no uno de mentira: lo que se afirma del signo tiene que ser el
 *  texto que la persona ve. */
const dinero = (v: number) => formatMoney(v, "CRC");

function marco(datos: typeof DATOS) {
  return renderToStaticMarkup(
    <ChartFrame
      titulo="C · Flujo de caja libre mensual"
      subtitulo="ingresos · gastos · flujo"
      alto={220}
      estado={datos.length < 2 ? "vacio" : "datos"}
      mensajeVacio="Hacen falta al menos dos meses cerrados para trazar el flujo."
      descripcion={describirGrafico({
        titulo: "Flujo de caja libre mensual",
        serie: datos.map((f) => ({ x: f.x, y: f["Flujo libre"] })),
        formato: dinero,
      })}
      tabla={tablaDeDatos(datos, SERIES, dinero, "Mes")}
      leyenda={<LeyendaSeries series={SERIES} />}
    >
      <PremiumLineChart
        data={datos}
        xKey="x"
        series={SERIES.map((s) => ({ key: s.clave, label: s.etiqueta, color: s.color }))}
      />
    </ChartFrame>,
  );
}

describe("el gráfico de línea no pinta lo que es del marco", () => {
  /**
   * Esto se comprueba sobre la FUENTE y no sobre el DOM, y el motivo es medido: Recharts no
   * dibuja nada en SSR. `renderToStaticMarkup(<PremiumLineChart …/>)` devuelve **145 caracteres**
   * —el envoltorio de `ResponsiveContainer` con un hijo de 0×0— porque el contenedor necesita
   * medir el ancho del padre y en el servidor no hay layout.
   *
   * Comprobado: con el `<Legend>` de Recharts puesto de vuelta en el lienzo, una aserción sobre el
   * marcado seguía pasando. Habría sido una guarda que pasa siempre, que es peor que ninguna.
   */
  const fuente = readFileSync(
    new URL("../../src/components/charts/line-chart.tsx", import.meta.url),
    "utf8",
  );
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("SSR no dibuja nada: por eso lo de abajo mira la fuente", () => {
    const solo = renderToStaticMarkup(
      <PremiumLineChart
        data={DATOS}
        xKey="x"
        series={SERIES.map((s) => ({ key: s.clave, label: s.etiqueta, color: s.color }))}
      />,
    );
    expect(solo).toContain("recharts-responsive-container");
    expect(
      solo.length,
      "si esto creciera, el gráfico ya se puede afirmar desde el marcado y estas guardas deberían mirarlo",
    ).toBeLessThan(400);
  });

  it("no pinta su propia leyenda", () => {
    // El `<Legend>` de Recharts se llevaba `height={22}` del alto del trazado y no se podía
    // seleccionar ni alcanzar con el teclado. Ahora va por el slot del marco.
    expect(sinComentarios, "volvió el <Legend> de Recharts").not.toMatch(/<Legend[\s/>]/);
    expect(sinComentarios, "volvió el import de Legend").not.toMatch(/^\s*Legend,$/m);
  });

  it("no se nombra a sí mismo ni se esconde del lector", () => {
    // El marco nombra la figura con `descripcion`, que dice el rango y el último valor. Y un
    // elemento focalizable dentro de un `aria-hidden` es la violación `aria-hidden-focus`, que es
    // justo lo que `accessibilityLayer` provocaría.
    expect(sinComentarios, 'volvió el role="img" del gráfico').not.toContain('role="img"');
    expect(sinComentarios, "volvió el aria-hidden del envoltorio").not.toContain("aria-hidden");
    expect(sinComentarios, "sin accessibilityLayer las flechas no recorren nada").toContain(
      "accessibilityLayer",
    );
  });

  it("no decide su estado vacío", () => {
    // Los cuatro estados los pone el marco: es el único que puede garantizar que midan lo mismo.
    expect(sinComentarios, "volvió el ChartEmpty del gráfico").not.toContain("ChartEmpty");
    expect(sinComentarios, "volvió el umbral de dos puntos").not.toContain("data.length < 2");
  });
});

describe("el marco del flujo libre", () => {
  const html = marco(DATOS);

  it("la tabla tiene las cuatro columnas, con el eje nombrado", () => {
    const encabezados = [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(encabezados).toEqual(["Mes", "Ingresos", "Gastos", "Flujo libre"]);
  });

  it("la tabla trae una fila por mes y el valor negativo con su signo", () => {
    const filas = [...html.matchAll(/<th scope="row">([^<]*)<\/th>/g)].map((m) => m[1]);
    expect(filas).toEqual(["jul", "ago", "sep"]);
    // El flujo libre de septiembre es negativo: si la tabla lo perdiera, diría lo contrario del
    // gráfico sobre el único mes en que la persona gastó más de lo que entró.
    expect(html, `el negativo perdió el signo: ${dinero(-50_000)}`).toContain(dinero(-50_000));
  });

  it("la leyenda está fuera del lienzo y nombra las tres series", () => {
    expect(html).toContain("cf-leyenda");
    for (const s of SERIES) expect(html).toContain(s.etiqueta);
    expect(
      html.indexOf("cf-leyenda"),
      "la leyenda tiene que venir ANTES del lienzo, no dentro",
    ).toBeLessThan(html.indexOf('class="cf-lienzo"'));
  });

  it("la descripción dice el rango y el último valor, no «gráfico de líneas»", () => {
    // El nombre de la figura es el del marco. Lo que se oye tiene que ser el dato, no la forma.
    expect(html).toContain("Flujo de caja libre mensual, jul a sep");
    expect(html).not.toContain("evolución en el tiempo");
  });

  it("con menos de dos meses el marco dice qué falta, y conserva el alto", () => {
    const vacio = marco([DATOS[0]!]);
    expect(vacio).toContain("Hacen falta al menos dos meses cerrados");
    expect(vacio, "el estado se declara, para poder afirmar sobre él").toContain(
      'data-estado="vacio"',
    );
    // El alto del lienzo es el mismo en los dos estados: es la invariante del marco, y con 220 px
    // es además el del `ChartSkeleton` del chart diferido, que es lo que evita el salto al hidratar.
    for (const h of [html, vacio]) expect(h).toContain("height:220px");
  });
});
