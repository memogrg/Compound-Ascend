/**
 * La escala «nice» de los ejes, y sobre todo: que el rótulo no mienta.
 */
import { describe, it, expect } from "vitest";

import { curvaDe } from "@/components/charts/core/theme";
import { escalaNice, incluyeCero } from "@/components/charts/core/escala-nice";
import { formatAxisCompact } from "@/lib/format";

const M = 1_000_000;

/** El valor que un rótulo de eje COMUNICA, leyéndolo como lo leería una persona. */
function valorDelRotulo(rotulo: string): number {
  const limpio = rotulo.replace(/[^\d,.\-−KMB]/g, "");
  const sufijo = /([KMB])$/.exec(limpio)?.[1];
  const mult = sufijo === "B" ? 1e12 : sufijo === "M" ? 1e6 : sufijo === "K" ? 1e3 : 1;
  const cuerpo = limpio
    .replace(/[KMB]$/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const signo = /^[-−]/.test(cuerpo) ? -1 : 1;
  return signo * Math.abs(Number(cuerpo.replace(/^[-−]/, ""))) * mult;
}

describe("valorDelRotulo (el lector del test)", () => {
  it("lee los rótulos que produce formatAxisCompact", () => {
    expect(valorDelRotulo(formatAxisCompact(2 * M, "CRC"))).toBe(2 * M);
    expect(valorDelRotulo(formatAxisCompact(2.5 * M, "CRC"))).toBe(2.5 * M);
    expect(valorDelRotulo(formatAxisCompact(250_000, "CRC"))).toBe(250_000);
    expect(valorDelRotulo(formatAxisCompact(-40 * M, "CRC"))).toBe(-40 * M);
  });

  it("y detecta el redondeo que se quiere cazar", () => {
    // Este es el defecto: el eje dice 2,3 M donde el dato vale 2,25 M.
    expect(formatAxisCompact(2_250_000, "CRC")).toContain("2,3M");
    expect(valorDelRotulo(formatAxisCompact(2_250_000, "CRC"))).toBe(2.3 * M);
  });
});

describe("escalaNice · los tres casos del prompt", () => {
  it("0 a 3M da 0 / 1M / 2M / 3M", () => {
    const e = escalaNice([0, 3 * M]);
    expect(e.ticks).toEqual([0, 1 * M, 2 * M, 3 * M]);
    expect(e.dominio).toEqual([0, 3 * M]);
    expect(e.paso).toBe(1 * M);
  });

  it("36M a 42M da 36 / 38 / 40 / 42M", () => {
    const e = escalaNice([36 * M, 42 * M]);
    expect(e.ticks).toEqual([36 * M, 38 * M, 40 * M, 42 * M]);
    expect(e.dominio).toEqual([36 * M, 42 * M]);
    expect(e.paso).toBe(2 * M);
  });

  it("0 a 60M da 0 / 20 / 40 / 60M", () => {
    const e = escalaNice([0, 60 * M]);
    expect(e.ticks).toEqual([0, 20 * M, 40 * M, 60 * M]);
    expect(e.dominio).toEqual([0, 60 * M]);
    expect(e.paso).toBe(20 * M);
  });
});

describe("escalaNice · el paso sale de {1, 2, 2,5, 5} × 10ᵏ", () => {
  const rangos: [number, number][] = [
    [0, 3 * M],
    [36 * M, 42 * M],
    [0, 60 * M],
    [0, 2.25 * M],
    [18 * M, 40.4 * M],
    [0, 907],
    [-4 * M, 9 * M],
    [1234, 98_765],
    [0, 1],
    [0.2, 0.9],
  ];

  it.each(rangos)("mantisa válida y 4-6 ticks en [%s, %s]", (a, b) => {
    const e = escalaNice([a, b]);
    expect(e.ticks.length).toBeGreaterThanOrEqual(4);
    expect(e.ticks.length).toBeLessThanOrEqual(6);
    const exp = Math.floor(Math.log10(e.paso));
    const mantisa = Number((e.paso / Math.pow(10, exp)).toPrecision(6));
    expect([1, 2, 2.5, 5], `paso ${e.paso} → mantisa ${mantisa}`).toContain(mantisa);
  });

  it.each(rangos)("el dominio es múltiplo del paso y contiene los datos en [%s, %s]", (a, b) => {
    const e = escalaNice([a, b]);
    expect(e.dominio[0]).toBeLessThanOrEqual(Math.min(a, b));
    expect(e.dominio[1]).toBeGreaterThanOrEqual(Math.max(a, b));
    for (const t of e.ticks) {
      const k = t / e.paso;
      expect(Math.abs(k - Math.round(k)), `tick ${t} no es múltiplo de ${e.paso}`).toBeLessThan(
        1e-6,
      );
    }
  });
});

describe("ningún rótulo representa un valor distinto al de su tick", () => {
  // La aserción que el código anterior NO pasaba: con la familia {1,2,5} el rango
  // 0-2,25M acababa con ticks que formatAxisCompact redondea, y el eje afirmaba 2,3M.
  const rangos: [number, number][] = [
    [0, 2.25 * M],
    [0, 3 * M],
    [36 * M, 42 * M],
    [0, 60 * M],
    [18 * M, 40.4 * M],
    [0, 1.25 * M],
    [0, 9 * M],
    [1_100_000, 1_900_000],
    [0, 45_500],
    [-2.25 * M, 2.25 * M],
  ];

  it.each(rangos)("en [%s, %s]", (a, b) => {
    const e = escalaNice([a, b], { moneda: "CRC" });
    expect(e.ticks.length).toBeGreaterThan(0);
    for (const t of e.ticks) {
      const rotulo = formatAxisCompact(t, "CRC");
      expect(
        valorDelRotulo(rotulo),
        `tick ${t} se rotula «${rotulo}», que dice ${valorDelRotulo(rotulo)}`,
      ).toBe(t);
    }
  });
});

describe("área honesta: solo con el cero dentro del dominio", () => {
  it("una serie de patrimonio recortada NO tiene base cero", () => {
    // 36 meses entre 18 M y 40,4 M: el eje arranca en 10 M, no en 0.
    const serie = Array.from({ length: 36 }, (_, i) => 18 * M + i * 640_000 + (i % 5) * 180_000);
    const e = escalaNice(serie, { moneda: "CRC" });
    expect(incluyeCero(e.dominio)).toBe(false);
    // Y al recortar a 6 meses, menos todavía.
    expect(incluyeCero(escalaNice(serie.slice(-6), { moneda: "CRC" }).dominio)).toBe(false);
  });

  it("una serie de gasto desde cero SÍ la tiene", () => {
    const e = escalaNice([0, 1.2 * M, 800_000], { desdeCero: true });
    expect(incluyeCero(e.dominio)).toBe(true);
  });

  it("una serie con negativos también cruza el cero", () => {
    expect(incluyeCero(escalaNice([-2 * M, 3 * M]).dominio)).toBe(true);
  });

  it("el dominio de «Todo» no desperdicia medio gráfico", () => {
    // Antes: 0 a 60 M para datos entre 18 y 40,4 M — el trazo vivía en el tercio central.
    const serie = Array.from({ length: 36 }, (_, i) => 18 * M + i * 640_000 + (i % 5) * 180_000);
    const e = escalaNice(serie, { moneda: "CRC" });
    const span = e.dominio[1] - e.dominio[0];
    const datos = Math.max(...serie) - Math.min(...serie);
    expect(datos / span, `dominio ${e.dominio} para datos de ${datos}`).toBeGreaterThan(0.5);
  });
});

describe("curvaDe: el presupuesto va en escalón", () => {
  it("una serie marcada como escalón usa stepAfter", () => {
    expect(curvaDe({ escalon: true })).toBe("stepAfter");
  });

  it("y una serie real conserva su curva", () => {
    expect(curvaDe({})).toBe("monotone");
    expect(curvaDe({ escalon: false })).toBe("monotone");
  });
});
