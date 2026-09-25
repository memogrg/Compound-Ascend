/**
 * La primitiva de PERIODO EN CURSO: un tramo que todavía no terminó no se dibuja como uno
 * cerrado, y lo dice en palabras.
 */
import { describe, it, expect } from "vitest";

import {
  rotuloEnCurso,
  partirSerieEnCurso,
  esTramoParcial,
} from "@/components/charts/core/periodo-en-curso";

describe("rotuloEnCurso", () => {
  it("dice el día y los días del mes", () => {
    expect(rotuloEnCurso({ dia: 18, diasDelMes: 30 })).toBe("en curso · día 18 de 30");
    expect(rotuloEnCurso({ dia: 1, diasDelMes: 31 })).toBe("en curso · día 1 de 31");
  });

  it("el último día del mes ya no está en curso", () => {
    // El día 30 de 30 es un mes COMPLETO: rotularlo «en curso» diría que falta algo.
    expect(rotuloEnCurso({ dia: 30, diasDelMes: 30 })).toBeNull();
  });

  it("no inventa nada con datos imposibles", () => {
    expect(rotuloEnCurso({ dia: 0, diasDelMes: 30 })).toBeNull();
    expect(rotuloEnCurso({ dia: 5, diasDelMes: 0 })).toBeNull();
    expect(rotuloEnCurso({ dia: 40, diasDelMes: 30 })).toBeNull();
    expect(rotuloEnCurso(null)).toBeNull();
  });
});

describe("esTramoParcial", () => {
  it("solo el ÚLTIMO punto es parcial, y solo si el periodo está en curso", () => {
    const p = { dia: 18, diasDelMes: 30 };
    expect(esTramoParcial(2, 3, p)).toBe(true);
    expect(esTramoParcial(1, 3, p)).toBe(false);
    expect(esTramoParcial(0, 3, p)).toBe(false);
  });

  it("con el mes cerrado no hay ningún parcial", () => {
    expect(esTramoParcial(2, 3, { dia: 30, diasDelMes: 30 })).toBe(false);
    expect(esTramoParcial(2, 3, null)).toBe(false);
  });
});

describe("partirSerieEnCurso", () => {
  const serie = [
    { x: "jul", y: 10 },
    { x: "ago", y: 20 },
    { x: "sep", y: 30 },
  ];

  it("deja la parte cerrada y el tramo en curso, compartiendo el punto de unión", () => {
    const { cerrada, enCurso } = partirSerieEnCurso(serie, { dia: 18, diasDelMes: 30 }, "y");
    // La cerrada llega hasta el penúltimo: el último es el mes a medias.
    expect(cerrada.map((p) => p.y)).toEqual([10, 20, null]);
    // El tramo en curso une el penúltimo con el último, para que la línea no se corte.
    expect(enCurso.map((p) => p.y)).toEqual([null, 20, 30]);
  });

  it("con el mes cerrado no hay tramo en curso y la serie va entera", () => {
    const { cerrada, enCurso } = partirSerieEnCurso(serie, { dia: 30, diasDelMes: 30 }, "y");
    expect(cerrada.map((p) => p.y)).toEqual([10, 20, 30]);
    expect(enCurso).toEqual([]);
  });

  it("con un solo punto no hay tramo que partir", () => {
    const uno = [{ x: "sep", y: 30 }];
    const { cerrada, enCurso } = partirSerieEnCurso(uno, { dia: 18, diasDelMes: 30 }, "y");
    expect(cerrada.map((p) => p.y)).toEqual([30]);
    expect(enCurso).toEqual([]);
  });

  it("sin periodo en curso devuelve la serie tal cual", () => {
    const { cerrada, enCurso } = partirSerieEnCurso(serie, null, "y");
    expect(cerrada).toEqual(serie);
    expect(enCurso).toEqual([]);
  });
});
