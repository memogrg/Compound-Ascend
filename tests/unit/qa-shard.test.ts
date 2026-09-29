/**
 * El reparto de rutas en shards, para que la captura quepa en CI.
 *
 * La regla que importa no es «que sean parecidos» sino que **la unión sea el inventario
 * entero y sin repetir**: un shard que se salta una ruta no da error, da un diff PARCIAL
 * —o peor, uno completo en apariencia— y eso es una medida falsa, que es la familia de
 * fallos que más caro ha salido en este repo.
 */
import { describe, it, expect } from "vitest";

// @ts-expect-error — `.mjs` sin tipos: es un script del arnés, no código de la app.
import { repartirEnShards } from "../../scripts/qa/shard.mjs";

const RUTAS = Array.from({ length: 39 }, (_, i) => ({ path: `/r${i}` }));

describe("repartirEnShards", () => {
  it("la unión de los shards es el inventario ENTERO, sin repetidos", () => {
    const todos = [1, 2].flatMap((n) =>
      repartirEnShards(RUTAS, n, 2).map((r: { path: string }) => r.path),
    );
    expect(new Set(todos).size).toBe(RUTAS.length);
    expect(todos).toHaveLength(RUTAS.length);
  });

  it("reparte parejo cuando no divide exacto: 39 en 2 → 20 y 19", () => {
    expect(repartirEnShards(RUTAS, 1, 2)).toHaveLength(20);
    expect(repartirEnShards(RUTAS, 2, 2)).toHaveLength(19);
  });

  it("con un solo shard devuelve todo", () => {
    expect(repartirEnShards(RUTAS, 1, 1)).toHaveLength(RUTAS.length);
  });

  it("es determinista: la misma ruta cae siempre en el mismo shard", () => {
    // Si no lo fuera, la base y la rama podrían capturar conjuntos distintos y el diff
    // compararía peras con manzanas sin avisar.
    const a = repartirEnShards(RUTAS, 1, 2).map((r: { path: string }) => r.path);
    const b = repartirEnShards(RUTAS, 1, 2).map((r: { path: string }) => r.path);
    expect(a).toEqual(b);
  });

  it("rechaza un shard fuera de rango, en vez de devolver vacío", () => {
    // Devolver vacío en silencio es cómo se capturan 0 rutas y se cree que no hay cambios.
    expect(() => repartirEnShards(RUTAS, 3, 2)).toThrow(/shard/i);
    expect(() => repartirEnShards(RUTAS, 0, 2)).toThrow(/shard/i);
  });
});
