/**
 * Una sola locale, y una sola tabla de meses.
 *
 * Medido antes de escribir nada: `es-MX` y `es-CR` difieren en **un mes**, septiembre. `es-MX`
 * abrevia «sep» y `es-CR` «sept»; los otros once coinciden, y las fechas largas son idénticas en
 * las tres locales que hay en el repo. O sea que la inconsistencia es pequeña y real a la vez:
 * dos pantallas de la misma app pueden escribir el mismo mes distinto, y solo en septiembre —
 * que es justo el tipo de fallo que nadie reproduce cuando lo reportan en octubre.
 *
 * El inventario que motivó esto, fuera de `format.ts`:
 *
 *     19 `toLocaleDateString` en 18 archivos, con 12 combinaciones de forma y locale
 *      8 `toLocaleString`
 *     es-MX ×9 · es-CR ×9 · es ×1   —y `{day, month:long, year}` aparece con las TRES—
 *
 * Este caso vigila que no vuelvan a aparecer. Formatear una fecha es una decisión de producto
 * —qué locale, qué abreviatura— y vive en un solo sitio.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const RAIZ = join(process.cwd(), "src");
const PERMITIDO = join(RAIZ, "lib", "format.ts");

function archivos(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (/\.tsx?$/.test(n)) acc.push(p);
  }
  return acc;
}

/** Los que de verdad importan: el resto del repo, sin el único sitio donde se decide. */
const FUENTES = archivos(RAIZ).filter((p) => p !== PERMITIDO);

describe("el formateo de fechas vive en un solo sitio", () => {
  it("ningún `toLocaleDateString` fuera de `lib/format.ts`", () => {
    const culpables = FUENTES.filter((p) => readFileSync(p, "utf8").includes("toLocaleDateString"))
      .map((p) => p.replace(`${process.cwd()}/`, ""))
      .sort();
    expect(culpables, `${culpables.length} archivo(s):\n  ${culpables.join("\n  ")}`).toEqual([]);
  });

  it("ninguna locale suelta fuera de `lib/format.ts`", () => {
    // `es-MX` y `es` incluidas: una locale escrita a mano en una pantalla es una decisión de
    // producto tomada en el sitio equivocado, aunque hoy coincida con la buena.
    //
    // Se busca la locale EN SU POSICIÓN —primer argumento de `Intl.*` o de un `toLocale*`—
    // y no la cadena suelta. La primera versión de esta guarda buscaba `"es"` en cualquier
    // parte y señalaba `palabra.endsWith("es")`, que es detección de plural en español: una
    // guarda que obliga a cambiar código correcto se gana que la siguiente persona la quite.
    const EN_POSICION = /(?:Intl\.\w+\(|toLocale\w*\(\s*)"es(?:-[A-Z]{2})?"/;
    const culpables = FUENTES.filter((p) => EN_POSICION.test(readFileSync(p, "utf8")))
      .map((p) => p.replace(`${process.cwd()}/`, ""))
      .sort();
    expect(
      culpables,
      `${culpables.length} archivo(s):\n  ${culpables.slice(0, 12).join("\n  ")}`,
    ).toEqual([]);
  });
});
