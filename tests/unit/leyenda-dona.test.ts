/**
 * Las filas de la leyenda de una dona. Lo puro: qué porcentaje lleva cada una y qué pasa
 * cuando la tarjeta no las muestra todas.
 *
 * El dibujo —que la leyenda baje debajo de la dona por debajo de 420 px de contenedor y que
 * ningún nombre se trunque— se prueba en el navegador.
 */
import { describe, expect, it } from "vitest";

import { filasLeyenda } from "@/components/charts/core/leyenda-dona";

const d = (name: string, value: number) => ({ name, value, color: "var(--chart-1)" });

describe("filasLeyenda", () => {
  it("los porcentajes suman exactamente 100", () => {
    // Tres tercios: redondeando cada uno por su cuenta dan 33+33+33 = 99. El mayor resto
    // reparte la unidad que falta, y la tarjeta deja de contradecirse.
    const filas = filasLeyenda([d("a", 1), d("b", 1), d("c", 1)]);
    expect(filas.map((f) => f.pct)).toEqual([34, 33, 33]);
    expect(filas.reduce((s, f) => s + f.pct, 0)).toBe(100);
  });

  it("también con muchas categorías desiguales", () => {
    const valores = [1_873_080, 1_696_000, 1_063_946, 1_060_000, 983_150, 780_000, 540_000];
    const filas = filasLeyenda(valores.map((v, i) => d(`c${i}`, v)));
    expect(filas.reduce((s, f) => s + f.pct, 0)).toBe(100);
  });

  it("conserva nombre, monto y color, en orden", () => {
    const filas = filasLeyenda([d("Hipoteca", 30), d("Feria", 70)]);
    expect(filas.map((f) => f.name)).toEqual(["Hipoteca", "Feria"]);
    expect(filas.map((f) => f.value)).toEqual([30, 70]);
    expect(filas.every((f) => f.color === "var(--chart-1)")).toBe(true);
  });

  it("recortada, agrupa el sobrante en una fila y la suma sigue dando 100", () => {
    // El panel muestra cinco categorías de veinte. Sin la fila del sobrante, los cinco
    // porcentajes suman 40 % y el lector no sabe dónde está el otro 60.
    const filas = filasLeyenda(
      [d("a", 40), d("b", 30), d("c", 10), d("d", 10), d("e", 5), d("f", 3), d("g", 2)],
      { maxFilas: 3 },
    );
    expect(filas).toHaveLength(4);
    expect(filas[3]!.name).toBe("Otras 4");
    expect(filas[3]!.value).toBe(20);
    expect(filas.reduce((s, f) => s + f.pct, 0)).toBe(100);
    expect(filas[3]!.resto).toBe(true);
  });

  it("no agrupa cuando cabe todo", () => {
    const filas = filasLeyenda([d("a", 1), d("b", 1)], { maxFilas: 5 });
    expect(filas).toHaveLength(2);
    expect(filas.some((f) => f.resto)).toBe(false);
  });

  it("una sola de sobra NO se agrupa: «Otras 1» ocupa lo mismo y dice menos", () => {
    const filas = filasLeyenda([d("a", 1), d("b", 1), d("c", 1)], { maxFilas: 2 });
    expect(filas.map((f) => f.name)).toEqual(["a", "b", "c"]);
  });

  it("sin datos no hay filas, y sin masa los porcentajes no se inventan", () => {
    expect(filasLeyenda([])).toEqual([]);
    const cero = filasLeyenda([d("a", 0), d("b", 0)]);
    expect(cero.map((f) => f.pct)).toEqual([0, 0]);
  });
});
