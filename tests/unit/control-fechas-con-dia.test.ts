/**
 * Las fechas de metas llevan DÍA.
 *
 * Al unificar los formateadores en `format.ts`, dos de `control/` cayeron en helpers que no
 * incluyen el día, y eso no es un cambio de formato: es perder el dato:
 *
 *   - «Próximo reinicio: sept 2026» no dice cuándo reinicia;
 *   - la columna de fecha del detalle de una meta mostraba «sept» en TODAS las filas del mismo
 *     mes, sin forma de distinguir dos movimientos ni de ordenarlos.
 *
 * Se comprueba el formateador, no el componente: lo que puede volver a perderse en silencio es
 * la elección de helper, y eso se ve en el texto que produce.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatDayMonthTiny, formatDayMonthTinyYear } from "@/lib/format";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

describe("fechas de metas · el día no se pierde", () => {
  it("el próximo reinicio dice el día", () => {
    expect(formatDayMonthTinyYear("2026-09-18")).toBe("18 sep 2026");
  });

  it("la fecha de un movimiento dice el día", () => {
    expect(formatDayMonthTiny("2026-09-18")).toBe("18 sep");
  });

  it("dos movimientos del mismo mes se distinguen", () => {
    // Es la razón de ser de la guarda: con «sep» los dos daban la misma cadena.
    expect(formatDayMonthTiny("2026-09-03")).not.toBe(formatDayMonthTiny("2026-09-18"));
  });

  it("ninguno de los dos componentes usa un helper sin día", () => {
    for (const rel of [
      "src/modules/control/components/goal-card.tsx",
      "src/modules/control/components/goal-detail-button.tsx",
    ]) {
      // Sin comentarios: lo que se prohíbe es el CÓDIGO. Los dos ficheros EXPLICAN en un
      // comentario por qué no usan el helper sin día, y castigar la explicación es la forma más
      // corta de que alguien la borre.
      const src = leer(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      // `formatMonthTiny` y `formatMonthTinyYear` son correctos donde solo importa el mes —un eje,
      // un rótulo de período—, pero no acá. Se prohíben por nombre exacto para no cazar
      // `formatDayMonthTiny`, que sí los lleva.
      expect(src, `${rel} usa un formateador sin día`).not.toMatch(
        /\bformatMonthTiny(Year)?\b(?!\w)/,
      );
      expect(src, `${rel} debería usar uno con día`).toMatch(/\bformatDayMonthTiny(Year)?\b/);
    }
  });
});
