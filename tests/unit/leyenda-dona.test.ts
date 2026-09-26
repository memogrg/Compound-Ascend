/**
 * Las filas de la leyenda de una dona. Lo puro: qué porcentaje lleva cada una, en qué orden
 * van y qué pasa cuando la tarjeta no las muestra todas.
 *
 * Hay DOS modos, y no son un ajuste de gusto: son dos preguntas distintas.
 *
 * · `taxonomia` — bloques fijos, pocos y con significado propio (los nueve de gasto, las
 *   clases de activo). Se muestran TODOS, en su orden canónico: el orden dice algo, y que un
 *   bloque desaparezca porque este mes gastó poco hace ilegible la comparación entre meses.
 * · `lista` — categorías, que son muchas y no tienen orden natural. Se ordenan por monto y se
 *   muestran las mayores; el resto se agrega en una fila.
 *
 * El dibujo —que la leyenda baje debajo de la dona por debajo de 420 px de contenedor y que
 * ningún nombre se trunque— se prueba en el navegador.
 */
import { describe, expect, it } from "vitest";

import { filasLeyenda } from "@/components/charts/core/leyenda-dona";

const d = (name: string, value: number, color = "var(--chart-1)") => ({ name, value, color });

describe("filasLeyenda · porcentajes", () => {
  it("suman exactamente 100", () => {
    // Tres tercios: redondeando cada uno por su cuenta dan 33+33+33 = 99. El mayor resto
    // reparte la unidad que falta, y la tarjeta deja de contradecirse.
    const { filas } = filasLeyenda([d("a", 1), d("b", 1), d("c", 1)]);
    expect(filas.map((f) => f.pct)).toEqual([34, 33, 33]);
    expect(filas.reduce((s, f) => s + f.pct, 0)).toBe(100);
  });

  it("también con muchas categorías desiguales", () => {
    const valores = [1_873_080, 1_696_000, 1_063_946, 1_060_000, 983_150, 780_000, 540_000];
    const { filas } = filasLeyenda(valores.map((v, i) => d(`c${i}`, v)));
    expect(filas.reduce((s, f) => s + f.pct, 0)).toBe(100);
  });

  it("sin datos no hay filas, y sin masa los porcentajes no se inventan", () => {
    expect(filasLeyenda([]).filas).toEqual([]);
    expect(filasLeyenda([d("a", 0), d("b", 0)]).filas.map((f) => f.pct)).toEqual([0, 0]);
  });
});

describe("filasLeyenda · modo taxonomia (el defecto)", () => {
  it("muestra TODOS los bloques, sin plegar y en el orden que se le dio", () => {
    // El orden canónico lo pone quien llama. Que un bloque se caiga de la leyenda porque este
    // mes gastó poco hace imposible comparar dos meses.
    const bloques = [
      "Esencial",
      "Estilo de vida",
      "Financiero",
      "Protección",
      "Crecimiento",
      "Ahorro",
      "Inversión",
    ];
    const { filas, ocultas } = filasLeyenda(
      bloques.map((n, i) => d(n, 100 - i * 10)),
      { modo: "taxonomia" },
    );
    expect(filas.map((f) => f.name)).toEqual(bloques);
    expect(ocultas).toEqual([]);
    expect(filas.some((f) => f.resto)).toBe(false);
  });

  it("no reordena aunque los montos vengan desordenados", () => {
    const { filas } = filasLeyenda([d("primero", 1), d("segundo", 99)], { modo: "taxonomia" });
    expect(filas.map((f) => f.name)).toEqual(["primero", "segundo"]);
  });
});

describe("filasLeyenda · modo lista", () => {
  const muchas = [
    d("e", 50),
    d("a", 400),
    d("g", 10),
    d("c", 200),
    d("b", 300),
    d("f", 30),
    d("d", 100),
    d("h", 5),
    d("i", 5),
  ];

  it("ordena por monto, de mayor a menor", () => {
    // Los cinco primeros del array son e(50) a(400) g(10) c(200) b(300).
    const { filas } = filasLeyenda(muchas.slice(0, 5), { modo: "lista" });
    expect(filas.map((f) => f.name)).toEqual(["a", "b", "c", "e", "g"]);
    expect(filas.map((f) => f.value)).toEqual([400, 300, 200, 50, 10]);
  });

  it("muestra seis y agrupa el resto, con la suma intacta", () => {
    const { filas } = filasLeyenda(muchas, { modo: "lista" });
    expect(filas).toHaveLength(7);
    expect(filas.slice(0, 6).map((f) => f.name)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(filas[6]!.name).toBe("Otras 3");
    expect(filas[6]!.resto).toBe(true);
    expect(filas[6]!.value).toBe(20); // g 10 + h 5 + i 5
    expect(filas.reduce((s, f) => s + f.pct, 0)).toBe(100);
  });

  it("las agrupadas quedan disponibles aparte, ordenadas, para «Ver todas»", () => {
    const { ocultas } = filasLeyenda(muchas, { modo: "lista" });
    expect(ocultas.map((f) => f.name)).toEqual(["g", "h", "i"]);
    expect(ocultas.map((f) => f.value)).toEqual([10, 5, 5]);
  });

  it("una sola de sobra NO se agrupa: «Otras 1» ocupa lo mismo que su nombre y dice menos", () => {
    const siete = muchas.slice(0, 7);
    const { filas, ocultas } = filasLeyenda(siete, { modo: "lista" });
    expect(filas).toHaveLength(7);
    expect(filas.some((f) => f.resto)).toBe(false);
    expect(ocultas).toEqual([]);
  });

  it("con seis o menos no agrupa nada", () => {
    const { filas, ocultas } = filasLeyenda(muchas.slice(0, 6), { modo: "lista" });
    expect(filas).toHaveLength(6);
    expect(ocultas).toEqual([]);
  });
});

describe("filasLeyenda · colores", () => {
  it("ninguna fila VISIBLE repite color: la fila del resto no toma el de nadie", () => {
    const paleta = [
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
      "var(--chart-5)",
      "var(--chart-6)",
    ];
    const datos = Array.from({ length: 20 }, (_, i) =>
      d(`c${i}`, 100 - i, paleta[i % paleta.length]!),
    );
    const { filas } = filasLeyenda(datos, { modo: "lista" });
    const colores = filas.map((f) => f.color);
    expect(new Set(colores).size, `colores: ${colores.join(", ")}`).toBe(colores.length);
  });
});
