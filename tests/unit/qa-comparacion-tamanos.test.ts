/**
 * La página de comparación no puede esconder la captura que MÁS cambió.
 *
 * `diff.mjs` no escribe PNG de diferencias cuando las dos capturas miden distinto —no hay dónde
 * restar—, y la página filtraba por «tiene diff». En la 2.7 eso dejó **4 de 12** visibles: las
 * ocho ausentes eran `/gastos` e `/ingresos` a 1280 y 390, o sea justo donde la altura cambió.
 * Una revisión visual a la que le faltan las filas grandes no es una revisión.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
// @ts-expect-error — `pngjs` no trae tipos y no vale la pena una dependencia más para un test.
import { PNG } from "pngjs";

let raiz = "";
const png = (w: number, h: number, tono: number) => {
  const p = new PNG({ width: w, height: h });
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = tono;
    p.data[i + 1] = tono;
    p.data[i + 2] = tono;
    p.data[i + 3] = 255;
  }
  return PNG.sync.write(p);
};

/** Un reporte mínimo, con la forma que escribe `diff.mjs`. */
const reporte = (capturas: unknown[]) =>
  JSON.stringify({
    comparadas: capturas.length,
    capturas,
    inestables: [],
    aprobadas: [],
    caducadas: [],
  });

beforeAll(() => {
  raiz = mkdtempSync(path.join(tmpdir(), "cmp-"));
  for (const lado of ["base", "rama"])
    mkdirSync(path.join(raiz, lado, "light", "1280"), { recursive: true });
  mkdirSync(path.join(raiz, "diff"), { recursive: true });
  // Misma anchura, ALTURAS distintas: es el caso que se perdía.
  writeFileSync(path.join(raiz, "base/light/1280/gastos.png"), png(40, 100, 255));
  writeFileSync(path.join(raiz, "rama/light/1280/gastos.png"), png(40, 60, 255));
  writeFileSync(
    path.join(raiz, "diff/reporte.json"),
    reporte([
      {
        imagen: "light/1280/gastos.png",
        px: 4000,
        pct: 100,
        maxDelta: 255,
        ignorados: 0,
        excluida: false,
        inestable: false,
        aprobada: false,
        reprobada: true,
        tamañoDistinto: true,
      },
    ]),
  );
  execFileSync(
    process.execPath,
    [
      "scripts/qa/comparacion.mjs",
      "--a",
      path.join(raiz, "base"),
      "--b",
      path.join(raiz, "rama"),
      "--diff",
      path.join(raiz, "diff"),
      "--out",
      path.join(raiz, "out"),
    ],
    { cwd: process.cwd() },
  );
});

afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe("comparación · capturas de tamaño distinto", () => {
  it("la captura entra a la página aunque no tenga PNG de diferencias", () => {
    const html = readFileSync(path.join(raiz, "out/comparacion.html"), "utf8");
    expect(html).toContain("light/1280/gastos.png");
    expect(html, "una sola captura, y es ésa").toContain("1 captura(s) con diferencias");
  });

  it("se copian el antes y el después, y se FABRICA el diff", () => {
    for (const lado of ["antes", "despues", "diff"])
      expect(
        existsSync(path.join(raiz, "out", lado, "light/1280/gastos.png")),
        `falta ${lado}`,
      ).toBe(true);
  });

  it("el diff fabricado mide lo que la MÁS ALTA de las dos", () => {
    // Si midiera lo que la más baja, la zona que solo existe en una quedaría fuera — que es
    // precisamente el cambio que hay que ver.
    const d = PNG.sync.read(readFileSync(path.join(raiz, "out/diff/light/1280/gastos.png")));
    expect(d.height).toBe(100);
    expect(d.width).toBe(40);
  });

  it("la página dice la diferencia de altura en píxeles, con su signo", () => {
    // El conteo de píxeles de una captura con tamaño distinto no se puede leer: «4000 px» no
    // dice «cambiaron 4000 píxeles», dice «la página se acortó y todo se corrió». El número
    // que explica la fila es cuánto cambió el alto.
    const html = readFileSync(path.join(raiz, "out/comparacion.html"), "utf8");
    expect(html).toContain("alto 100 → 60 px (-40)");
    expect(html, "y se marca de un vistazo").toContain("tamaño distinto");
  });
});
