/**
 * El recorte por presets de rango.
 */
import { describe, it, expect } from "vitest";

import { recortar, presetsUtiles, NOMBRE_RANGO } from "@/components/charts/core/rangos";

const serie = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("recortar", () => {
  it("se queda con la COLA: lo reciente, no lo viejo", () => {
    expect(recortar(serie(24), "6M")).toEqual([18, 19, 20, 21, 22, 23]);
  });

  it("«Todo» no recorta", () => {
    expect(recortar(serie(36), "Todo")).toHaveLength(36);
  });

  it("si el preset pide más de lo que hay, devuelve todo sin rellenar", () => {
    // Inventar meses vacíos al principio dibujaría una caída desde cero que nunca ocurrió.
    expect(recortar(serie(4), "1A")).toEqual([0, 1, 2, 3]);
  });

  it("cada preset deja el número de puntos que promete", () => {
    expect(recortar(serie(36), "3M")).toHaveLength(3);
    expect(recortar(serie(36), "6M")).toHaveLength(6);
    expect(recortar(serie(36), "1A")).toHaveLength(12);
    expect(recortar(serie(36), "2A")).toHaveLength(24);
  });

  it("no muta la serie original", () => {
    const s = serie(10);
    recortar(s, "3M");
    expect(s).toHaveLength(10);
  });

  it("una serie vacía no explota", () => {
    expect(recortar([], "6M")).toEqual([]);
  });
});

describe("presetsUtiles", () => {
  it("con historial largo, todos sirven", () => {
    expect(presetsUtiles(36, ["6M", "1A", "Todo"])).toEqual(["6M", "1A", "Todo"]);
  });

  it("descarta los presets que no recortarían nada", () => {
    // Con 8 meses, «1A» y «Todo» muestran lo mismo: un botón que no hace nada.
    expect(presetsUtiles(8, ["6M", "1A", "2A", "Todo"])).toEqual(["6M", "1A", "Todo"]);
  });

  it("«Todo» se queda siempre, como ancla", () => {
    expect(presetsUtiles(2, ["6M", "1A", "Todo"])).toContain("Todo");
  });

  it("cada preset tiene un nombre hablado distinto del chip", () => {
    // «6M» no se lee bien en voz alta.
    expect(NOMBRE_RANGO["6M"]).toBe("últimos 6 meses");
    expect(NOMBRE_RANGO.Todo).toBe("todo el historial");
  });
});
