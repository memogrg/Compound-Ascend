/**
 * Ningún spec de navegador puede leer el reloj real.
 *
 * El 30-sep-2026 `charts-calendario.spec.ts` se puso rojo sin que nadie tocara nada: el catálogo
 * de `/dev/ui` calcula sus días en el CLIENTE, el último día del mes no deja ningún día futuro, y
 * el spec exige que los haya. El arnés congela el reloj del servidor (preload de `qa:start`) y el
 * del navegador en las capturas (`snap.mjs`), pero los specs abrían el navegador con el reloj de
 * la máquina — eran la única pieza mirando otro calendario.
 *
 * Esta guarda comprueba las dos mitades, porque arreglar solo una no arregla nada (lo aprendí
 * arreglando una sola):
 *
 *   1. todo spec que abre una página CONGELA su reloj;
 *   2. ningún spec lee el reloj real para calcular una fecha esperada.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CARPETAS = ["tests/a11y", "tests/e2e"];

function specs(): { rel: string; src: string }[] {
  const out: { rel: string; src: string }[] = [];
  for (const dir of CARPETAS)
    for (const f of readdirSync(path.join(RAIZ, dir)))
      if (f.endsWith(".spec.ts"))
        out.push({
          rel: `${dir}/${f}`,
          src: readFileSync(path.join(RAIZ, dir, f), "utf8"),
        });
  return out;
}

/** Quita comentarios: lo que se prohíbe es el código, no hablar de él. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("specs de navegador · reloj congelado", () => {
  it("hay specs que revisar", () => {
    // Si el glob se rompe, todo lo de abajo pasaría en verde sin mirar nada.
    expect(specs().length, "no se encontró ningún spec").toBeGreaterThan(10);
  });

  it("ninguno lee el reloj real", () => {
    // `new Date()` y `Date.now()` SIN argumentos son las dos formas de preguntarle la hora a la
    // máquina. `new Date("2026-09-18")` y `new Date(Date.UTC(...))` construyen una fecha a partir
    // de datos y no se tocan: prohibirlas obligaría a reescribir código correcto, y una guarda que
    // hace eso se gana que la quiten entera.
    const culpables: string[] = [];
    for (const { rel, src } of specs()) {
      const codigo = sinComentarios(src);
      for (const m of codigo.matchAll(/\bnew Date\(\s*\)|\bDate\.now\(\s*\)/g))
        culpables.push(`${rel} → ${m[0]}`);
    }
    expect(culpables, `usá el instante de tests/a11y/reloj.ts:\n${culpables.join("\n")}`).toEqual(
      [],
    );
  });

  it("todo spec que abre una página congela su reloj", () => {
    // La otra mitad. Sin esto, un spec nuevo abriría el navegador con el reloj de la máquina y
    // el fallo volvería el último día de algún mes, en una pantalla cualquiera.
    const culpables: string[] = [];
    for (const { rel, src } of specs()) {
      const abre = (sinComentarios(src).match(/\.newPage\(\)/g) ?? []).length;
      if (abre === 0) continue;
      const congela = (sinComentarios(src).match(/congelarReloj\(/g) ?? []).length;
      if (congela < abre) culpables.push(`${rel} — abre ${abre} página(s) y congela ${congela}`);
    }
    expect(culpables, `falta congelarReloj():\n${culpables.join("\n")}`).toEqual([]);
  });

  it("el módulo del instante no usa `import.meta`", () => {
    // Playwright transpila los specs a CommonJS. Un `import.meta` en la cadena de importaciones
    // revienta con «Cannot use 'import.meta' outside a module» ANTES de ejecutar nada: los cuatro
    // jobs de E2E murieron con «No tests found», que no se parece en nada a la causa. Medido:
    // apuntando el helper a `snap.mjs`, `playwright test --list` da 0 tests en 0 ficheros; con
    // `instante.mjs`, 225 en 16.
    // Sin comentarios: lo que se prohíbe es el CÓDIGO. El propio módulo explica en su cabecera
    // por qué no lo usa, y una guarda que castiga la explicación se gana que borren la explicación.
    const src = sinComentarios(readFileSync(path.join(RAIZ, "scripts/qa/instante.mjs"), "utf8"));
    expect(src, "`instante.mjs` lo importan los specs: no puede usar import.meta").not.toContain(
      "import.meta",
    );
  });

  it("el instante sale del arnés, no de una copia", () => {
    // Dos implementaciones de «qué día es» se separan en cuanto una cambia, y la que cambia no
    // es la que falla. El helper reusa `instanteCongelado` de `instante.mjs`, que es el mismo que
    // resuelve el servidor congelado y las capturas.
    const reloj = readFileSync(path.join(RAIZ, "tests/a11y/reloj.ts"), "utf8");
    expect(reloj).toContain("instanteCongelado");
    expect(reloj).toContain("scripts/qa/instante.mjs");
    expect(reloj, "lee QA_INSTANTE y QA_FREEZE").toMatch(/QA_INSTANTE[\s\S]*QA_FREEZE/);
  });
});
