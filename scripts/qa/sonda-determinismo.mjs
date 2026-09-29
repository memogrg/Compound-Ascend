#!/usr/bin/env node
/**
 * ¿Dos capturas de la MISMA compilación contra el MISMO servidor salen iguales?
 *
 * Existe porque en CI se retira `--deterministic-mode` —ahí no produce fotogramas— y esa
 * bandera era justamente la que prometía repetibilidad. Quitarla y confiar sería cambiar una
 * garantía por una suposición; esto la vuelve a demostrar donde importa, en el mismo job y
 * sobre las mismas pantallas.
 *
 * Veinte rutas fijas, un tema y un ancho: suficiente para cazar antialiasing inestable sin
 * pagar otras 200 capturas. Si el resultado no es 0 de 20, el job falla y dice cuáles y con
 * qué delta — no se ajusta el umbral, que sería tapar justo lo que se viene a medir.
 *
 *   node scripts/qa/sonda-determinismo.mjs --a <tanda1> --b <tanda2>
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const args = {};
for (let i = 2; i < process.argv.length; i += 2)
  args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
for (const k of ["a", "b"]) {
  if (!args[k]) {
    console.error(`Falta --${k}`);
    process.exit(2);
  }
}

const r = spawnSync(
  process.execPath,
  [
    // `fileURLToPath` y NO `new URL(...).pathname`: este repo vive en «Compound Ascend v1»,
    // con espacios, y `pathname` los percent-codifica. La ruta salía
    // «/Users/…/Compound%20Ascend%20v1/scripts/qa/diff.mjs», que no existe, así que `diff.mjs`
    // no llegaba a correr NUNCA en local — y la sonda lo reportaba como «-1/6», o sea como si
    // las pantallas fueran inestables. En CI no se veía: la ruta del runner no tiene espacios.
    path.join(path.dirname(fileURLToPath(import.meta.url)), "diff.mjs"),
    "--a",
    args.a,
    "--b",
    args.b,
    "--out-diff",
    args["out-diff"] ?? "diff-determinismo",
    // Umbral CERO y sin filtro de antialiasing: acá no se tolera nada, porque es la MISMA
    // compilación contra el MISMO servidor. Cualquier píxel distinto es inestabilidad.
    "--max-diff-pixels",
    "0",
    "--max-delta",
    "0",
    "--ignore-delta-below",
    "0",
  ],
  { encoding: "utf8" },
);
const salida = `${r.stdout ?? ""}${r.stderr ?? ""}`;

// Si `diff.mjs` no dejó su línea de resumen, no comparó nada: puede ser que no arrancara
// (ruta mal formada, módulo ausente) o que se negara a comparar (banderas de interfaz
// distintas entre las dos tandas). Lo que NO se puede hacer es inventar un conteo: la versión
// anterior caía a «-1» y lo imprimía como si fuera un veredicto —«sonda de determinismo:
// -1/6»—, que se lee como «las pantallas son inestables» cuando lo que pasa es que la medida
// no existe. Sin medida no hay veredicto: se sale en rojo diciendo eso.
const m = /(\d+) comparadas · (\d+) con diferencias/.exec(salida);
if (!m) {
  console.log(salida.trim());
  console.error(
    "::error::la sonda no pudo medir: `diff.mjs` no imprimió su resumen " +
      `(salió ${r.status ?? "sin código"}). Arriba está su salida entera.`,
  );
  process.exit(1);
}
const total = Number(m[1]);
const distintas = Number(m[2]);

console.log(`sonda de determinismo: ${distintas}/${total}`);
if (distintas !== 0) {
  console.log(
    salida
      .split("\n")
      .filter((l) => /\.png/.test(l))
      .slice(0, 20)
      .join("\n"),
  );
  console.error(
    "::error::las dos tandas de la MISMA compilación no salieron iguales. " +
      "No se ajusta el umbral: si esto no da cero, las capturas no sirven como evidencia.",
  );
  process.exit(1);
}
