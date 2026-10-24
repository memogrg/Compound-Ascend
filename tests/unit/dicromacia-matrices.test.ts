/**
 * Las matrices del filtro SVG y las del validador de paleta tienen que ser la MISMA cuenta.
 *
 * Son dos implementaciones de Viénot–Brettel que viven en sitios distintos —una simula en
 * pantalla, la otra decide si la paleta cumple— y el día que se separen, la galería enseñaría
 * unos colores y el validador aprobaría otros. Nadie lo notaría: las dos seguirían dando
 * resultados plausibles.
 *
 * Por eso esto no compara cadenas ni copia una tabla: recompone la transformación desde las
 * constantes del validador y la contrasta contra la que usa el filtro, color a color.
 */
import { describe, it, expect } from "vitest";

import { DICROMACIAS, matrizDicromacia, valoresFeColorMatrix } from "@/lib/qa/dicromacia";

type RGB = [number, number, number];

/** La simulación del VALIDADOR, copiada tal cual de `contraste-paleta.test.ts`. */
function comoLoVeElValidador([r, g, b]: RGB, tipo: "prot" | "deut" | "trit"): RGB {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const inv = (v: number) =>
    (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  const [R, G, B] = [f(r), f(g), f(b)];
  const L = 0.31399 * R + 0.63951 * G + 0.04649 * B;
  const M = 0.15537 * R + 0.75789 * G + 0.0867 * B;
  const S = 0.01775 * R + 0.10945 * G + 0.87262 * B;
  let [l, m, s2] = [L, M, S];
  if (tipo === "prot") l = 1.05118294 * M - 0.05116099 * S;
  if (tipo === "deut") m = 0.9513092 * L + 0.04866992 * S;
  if (tipo === "trit") s2 = -0.86744736 * L + 1.86727089 * M;
  return [
    inv(5.47221206 * l - 4.6419601 * m + 0.16963708 * s2),
    inv(-1.1252419 * l + 2.29317094 * m - 0.1678952 * s2),
    inv(0.02980165 * l - 0.19318073 * m + 1.16364789 * s2),
  ].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
}

/** Lo que haría el navegador con la matriz del filtro, en RGB LINEAL (como manda SVG). */
function comoLoVeElFiltro(c: RGB, tipo: (typeof DICROMACIAS)[number]): RGB {
  const aLineal = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const aSrgb = (v: number) =>
    (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  const m = matrizDicromacia(tipo);
  const lin = c.map(aLineal) as RGB;
  return m
    .map((fila) => aSrgb(fila[0]! * lin[0] + fila[1]! * lin[1] + fila[2]! * lin[2]))
    .map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
}

const EQUIVALENTE = { protanopia: "prot", deuteranopia: "deut", tritanopia: "trit" } as const;

/** Colores de prueba: los seis de la paleta más los extremos, que es donde se ven las grietas. */
const MUESTRAS: RGB[] = [
  [0x37, 0x84, 0x51], // --chart-1
  [0x36, 0x67, 0x9b], // --chart-2
  [0xbe, 0x86, 0x2d], // --chart-3
  [0x81, 0x63, 0xb0], // --chart-4
  [0xbc, 0x48, 0x45], // --chart-5
  [0x0f, 0x9a, 0xa8], // --chart-6
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
];

describe("la matriz del filtro es la misma cuenta que la del validador", () => {
  for (const tipo of DICROMACIAS) {
    it(`${tipo}: mismo color de salida, canal a canal`, () => {
      for (const c of MUESTRAS) {
        const validador = comoLoVeElValidador(c, EQUIVALENTE[tipo]);
        const filtro = comoLoVeElFiltro(c, tipo);
        for (let i = 0; i < 3; i++) {
          // ±1 por el redondeo a entero de cada lado, no por tolerancia a la deriva.
          expect(
            Math.abs(validador[i]! - filtro[i]!),
            `${tipo} · rgb(${c.join(",")}) → validador ${validador.join(",")} · filtro ${filtro.join(",")}`,
          ).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  it("el `values` del filtro es 4×5 y deja el alfa intacto", () => {
    for (const tipo of DICROMACIAS) {
      const v = valoresFeColorMatrix(tipo).split(/\s+/).map(Number);
      expect(v, tipo).toHaveLength(20);
      // La última fila: alfa pasa tal cual. Simular dicromacia no puede atenuar la página, o
      // cualquier medida de contraste tomada encima estaría midiendo dos cosas a la vez.
      expect(v.slice(15), `${tipo} · alfa`).toEqual([0, 0, 0, 1, 0]);
    }
  });

  it("protanopía y deuteranopía colapsan R y G en el mismo canal", () => {
    // La confusión clásica rojo-verde. Si esta afirmación se rompe, la composición está mal:
    // no es una propiedad que se haya elegido, es lo que significa perder un cono.
    for (const tipo of ["protanopia", "deuteranopia"] as const) {
      const m = matrizDicromacia(tipo);
      for (let j = 0; j < 3; j++) {
        expect(Math.abs(m[0]![j]! - m[1]![j]!), `${tipo} · columna ${j}`).toBeLessThan(0.001);
      }
    }
  });
});
