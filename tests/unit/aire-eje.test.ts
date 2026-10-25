/**
 * El último rótulo del eje X no se recorta (decisión 57).
 *
 * El defecto era el mismo en los tres gráficos del núcleo y tenía la misma forma: un número
 * redondo de píxeles a la derecha, escrito sin mirar cuánto mide la etiqueta que tiene que caber
 * ahí. Con «sep 2026» —ocho caracteres, el rótulo más largo que produce la app— no cabía.
 *
 * Lo que se fija acá es el CÁLCULO, no la pantalla: el aire se estima a partir del texto, así que
 * se puede afirmar sin navegador. Que el cálculo esté efectivamente enchufado se afirma al final,
 * sobre la fuente, porque un margen vuelve a ser un número redondo en una línea de código y nada
 * más avisaría.
 */
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

import { aireEnBanda, aireParaRotuloFinal, anchoDeTexto } from "@/components/charts/core";

/** El rótulo largo de verdad: mes abreviado y año de cuatro cifras. */
const SEP_2026 = "sep 2026";
/** Lo que medía el margen derecho de `line-chart` antes de esto. */
const MARGEN_VIEJO = 8;

describe("el ancho estimado de un rótulo", () => {
  it("crece con el texto y con el tamaño de fuente", () => {
    expect(anchoDeTexto(SEP_2026, 10.5)).toBe(51);
    expect(anchoDeTexto(SEP_2026, 11)).toBe(53);
    // «sep 26» es el otro rótulo real (el de `axisDateLabel`), y mide menos: si estos dos
    // dieran lo mismo, la estimación no estaría mirando el texto.
    expect(anchoDeTexto("sep 26", 10.5)).toBe(38);
  });

  it("un rótulo vacío no pide ancho", () => {
    expect(anchoDeTexto("", 10.5)).toBe(0);
  });
});

describe("escala de puntos: el tick cae sobre el borde", () => {
  it("«sep 2026» pide más del doble del margen que había", () => {
    const aire = aireParaRotuloFinal(SEP_2026, 10.5, MARGEN_VIEJO);
    // 51 px de ancho, de los que la mitad queda fuera del trazado.
    expect(aire).toBe(26);
    expect(
      aire - MARGEN_VIEJO,
      "con el margen de antes, «sep 2026» se recortaba esta cantidad de píxeles",
    ).toBe(18);
  });

  it("el mínimo solo puede AÑADIR aire, nunca quitarlo", () => {
    // Un rótulo tan corto que ni su mitad llega al mínimo: el gráfico conserva el aire que ya
    // tenía, porque este cálculo no está para estrecharlo.
    expect(aireParaRotuloFinal("26", 10.5, MARGEN_VIEJO)).toBe(MARGEN_VIEJO);
    expect(aireParaRotuloFinal("", 10.5, MARGEN_VIEJO)).toBe(MARGEN_VIEJO);
  });

  it("incluso «jul» pedía más de 8 px: el margen viejo no cabía ni con el rótulo corto", () => {
    // «jul» es el rótulo del flujo de caja libre, el más corto que la app pinta de verdad.
    expect(aireParaRotuloFinal("jul", 10.5, MARGEN_VIEJO)).toBe(10);
  });
});

describe("escala de banda: la banda ya protege media etiqueta", () => {
  it("con la banda más ancha que el rótulo no se añade nada", () => {
    // 12 meses en 420 px de trazado = 35 px de banda; «sep 26» a 11 px mide 40, así que
    // sobresalen 3 px y los 10 del mínimo los cubren. Es el caso de hoy en el histórico, y por
    // eso el histórico no se mueve.
    expect(aireEnBanda("sep 26", 11, 35, 10)).toBe(10);
  });

  it("con muchas columnas, o un rótulo largo, sí añade — y solo lo que sobresale", () => {
    // 24 columnas en 420 px = 17,5 px de banda. «sep 2026» a 11 px mide 53: sobresalen
    // 53/2 − 17,5/2 = 17,75 → 18, por encima del mínimo de 10.
    expect(aireEnBanda(SEP_2026, 11, 17.5, 10)).toBe(18);
    // Sin mínimo, es exactamente lo que sobresale: no inventa aire.
    expect(aireEnBanda(SEP_2026, 11, 17.5)).toBe(18);
  });

  it("sin banda medida (el primer render, antes de medir el ancho) devuelve el mínimo", () => {
    // `useAncho` devuelve 0 hasta que el observador mide: ahí el rótulo pediría media etiqueta
    // entera, y lo que importa es no dar un margen absurdo al gráfico de 0 px de ancho.
    expect(aireEnBanda(SEP_2026, 11, 0, 10)).toBe(27);
  });
});

describe("el cálculo está enchufado en los tres gráficos", () => {
  const fuente = (rel: string) =>
    readFileSync(new URL(`../../src/components/charts/${rel}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  it("`line-chart` saca su margen derecho del rótulo", () => {
    const s = fuente("line-chart.tsx");
    expect(s).toContain("aireParaRotuloFinal");
    expect(s, "volvió el número redondo a la derecha").not.toMatch(/right:\s*8\b/);
  });

  it("`area-chart` saca su margen derecho del rótulo", () => {
    const s = fuente("area-chart.tsx");
    expect(s).toContain("aireParaRotuloFinal");
    expect(s, "volvió el margen por nivel de ejes").not.toMatch(/right:\s*full\s*\?/);
  });

  it("`historico-gasto` lo saca de la banda, no de una constante", () => {
    const s = fuente("core/historico-gasto.tsx");
    expect(s).toContain("aireEnBanda");
    expect(
      s,
      "el margen volvió a la constante: en banda el recorte depende de cuántas columnas haya",
    ).not.toMatch(/right:\s*AIRE_DERECHA\b/);
  });
});
