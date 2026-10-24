/**
 * Este repo vive en «/Users/memogrg/Compound Ascend v1»: la ruta tiene ESPACIOS.
 *
 * `new URL(import.meta.url).pathname` los percent-codifica («Compound%20Ascend%20v1»), así que
 * cualquier ruta derivada de ahí y usada para leer un fichero o lanzar un proceso apunta a algo
 * que no existe. `fileURLToPath` decodifica y es la forma correcta.
 *
 * Mordió en `scripts/qa/sonda-determinismo.mjs`: lanzaba `diff.mjs` con la ruta codificada, el
 * spawn fallaba, y como el resumen de `diff.mjs` nunca aparecía la sonda caía a su valor de
 * respaldo e imprimía «sonda de determinismo: -1/6» — que se lee como «las pantallas son
 * inestables», no como «la medida no existe». En CI no se veía porque la ruta del runner
 * (`/home/runner/work/Compound-Ascend/Compound-Ascend`) no tiene espacios: es un fallo que solo
 * aparece en la máquina donde se itera, que es el peor sitio para tenerlo.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function ficheros(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const completa = path.join(dir, entrada);
    if (statSync(completa).isDirectory()) salida.push(...ficheros(completa));
    else if (/\.(mjs|js|ts)$/.test(entrada)) salida.push(completa);
  }
  return salida;
}

describe("rutas derivadas de import.meta.url", () => {
  it("ningún script usa `new URL(import.meta.url).pathname` para una ruta de fichero", () => {
    const culpables = ficheros(path.join(RAIZ, "scripts"))
      .filter((f) => /new URL\(import\.meta\.url\)\.pathname/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(RAIZ, f));
    expect(culpables, `usá fileURLToPath(import.meta.url): ${culpables.join(", ")}`).toEqual([]);
  });

  it("la sonda de determinismo resuelve `diff.mjs` con fileURLToPath", () => {
    const src = readFileSync(path.join(RAIZ, "scripts/qa/sonda-determinismo.mjs"), "utf8");
    expect(src).toContain("fileURLToPath");
    expect(src).toMatch(/path\.dirname\(fileURLToPath\(import\.meta\.url\)\)/);
  });

  it("la sonda no inventa un conteo cuando no pudo medir", () => {
    // El respaldo «-1» imprimía un veredicto sin medida. Sin resumen de `diff.mjs` hay que
    // salir en rojo diciendo que no se pudo medir, no dar un número negativo por bueno.
    const src = readFileSync(path.join(RAIZ, "scripts/qa/sonda-determinismo.mjs"), "utf8");
    expect(src).not.toMatch(/:\s*-1\b/);
    expect(src).toMatch(/if \(!m\)[\s\S]*?no pudo medir[\s\S]*?exit\(1\)/);
  });
});
