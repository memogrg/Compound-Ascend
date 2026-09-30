/**
 * Un gráfico dentro de un marco tiene UNA tabla, no dos.
 *
 * `ChartFrame` exige su tabla accesible —es la garantía del núcleo— y `HistoricoGasto` pintaba
 * además la suya, dentro de un `<details>` propio. Al migrar el histórico al marco quedaron las
 * dos en la misma tarjeta: cinco columnas repetidas y, para quien navega con lector de pantalla,
 * dos recorridos de los mismos números. `gastos-historico.spec.ts` lo vio como «esperaba 3 filas
 * y recibió 6», que no se parece a la causa.
 *
 * Este test mira el marcado, no el navegador, así que falla en `npm run test` y no veinte minutos
 * después en la suite de accesibilidad.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ChartFrame, HistoricoGasto, tablaHistoricoGasto } from "@/components/charts/core";

const DATOS = [
  { label: "jul", real: 900_000, presupuesto: 1_000_000 },
  { label: "ago", real: 1_200_000, presupuesto: 1_000_000 },
  { label: "sept", real: 400_000, presupuesto: 1_000_000 },
];
const EN_CURSO = { anio: 2026, mes: 9, dia: 12, diasDelMes: 30 };

const contar = (html: string, aguja: string) => html.split(aguja).length - 1;

describe("un gráfico en su marco tiene UNA sola tabla", () => {
  const html = renderToStaticMarkup(
    <ChartFrame
      titulo="Histórico de gastos"
      descripcion="Gasto real contra presupuesto, por mes."
      estado="datos"
      tabla={tablaHistoricoGasto(DATOS, "CRC", EN_CURSO)}
    >
      <HistoricoGasto datos={DATOS} moneda="CRC" enCurso={EN_CURSO} />
    </ChartFrame>,
  );

  it("hay exactamente un <table>", () => {
    expect(contar(html, "<table"), "dos tablas de los mismos datos").toBe(1);
    expect(contar(html, 'cf-tabla"')).toBe(1);
  });

  it("y un solo <caption>, el de la tabla", () => {
    expect(contar(html, "<caption")).toBe(1);
    expect(html).toContain("Gasto y presupuesto por mes");
  });

  it("una fila de datos por mes, más la nota del mes en curso", () => {
    // Tres meses ⇒ tres `<th scope="row">`. La nota NO es una fila de datos: va a todo el
    // ancho, y por eso se cuenta aparte.
    expect(contar(html, 'scope="row"'), "una fila por mes").toBe(3);
    expect(contar(html, "cf-tabla-nota"), "la nota del mes abierto").toBe(1);
  });

  it("la nota del mes en curso la pinta el MARCO, con su tono", () => {
    expect(html).toContain("cf-tabla-avance");
    expect(html).toMatch(/cf-tabla-avance[^>]*data-tono="(neutro|alerta)"/);
  });

  it("el gráfico ya no trae su propio `<details>` de datos", () => {
    // Era el envoltorio de la tabla duplicada. Si vuelve, vuelven las dos tablas.
    expect(contar(html, "cf-datos-abrir"), "el <details> propio del gráfico").toBe(0);
  });
});
