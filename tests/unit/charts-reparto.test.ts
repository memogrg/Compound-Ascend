/**
 * El reparto de mayor resto: las partes suman EXACTAMENTE el total que se muestra.
 */
import { describe, it, expect } from "vitest";

import { repartoMayorResto } from "@/components/charts/core/reparto";

describe("repartoMayorResto", () => {
  it("el caso del prompt: 27.639.264,6 + 4.917.560,6 = 32.556.825", () => {
    const partes = [27_639_264.6, 4_917_560.6];
    const total = Math.round(partes[0]! + partes[1]!); // 32.556.825
    expect(total).toBe(32_556_825);

    // Redondear cada parte por separado da 32.556.826: uno de más.
    expect(Math.round(partes[0]!) + Math.round(partes[1]!)).toBe(32_556_826);

    const r = repartoMayorResto(partes);
    expect(r.reduce((a, b) => a + b, 0)).toBe(32_556_825);
    expect(r).toEqual([27_639_265, 4_917_560]);
  });

  it("suma exacta con muchas partes y restos parecidos", () => {
    const partes = [1 / 3, 1 / 3, 1 / 3].map((f) => f * 100);
    const r = repartoMayorResto(partes);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r).toEqual([34, 33, 33]); // el empate lo rompe el índice menor
  });

  it("respeta un total explícito distinto de la suma", () => {
    const r = repartoMayorResto([1, 1, 1], 10);
    expect(r.reduce((a, b) => a + b, 0)).toBe(10);
    expect(r).toEqual([4, 3, 3]);
  });

  it("es determinista: dos llamadas idénticas dan lo mismo", () => {
    const partes = [10.5, 10.5, 10.5, 10.5];
    expect(repartoMayorResto(partes)).toEqual(repartoMayorResto(partes));
    expect(repartoMayorResto(partes).reduce((a, b) => a + b, 0)).toBe(42);
  });

  it("no inventa masa donde no la hay", () => {
    expect(repartoMayorResto([])).toEqual([]);
    expect(repartoMayorResto([0, 0, 0])).toEqual([0, 0, 0]);
    expect(repartoMayorResto([0, 0], 5)).toEqual([5, 0]);
  });

  it("conserva la suma también con valores no finitos entre medias", () => {
    const r = repartoMayorResto([10.4, Number.NaN, 10.4]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(21);
  });

  it("aguanta partes negativas sin perder la suma", () => {
    const partes = [100.5, -30.2, 20.7];
    const total = Math.round(partes.reduce((a, b) => a + b, 0));
    expect(repartoMayorResto(partes).reduce((a, b) => a + b, 0)).toBe(total);
  });
});
