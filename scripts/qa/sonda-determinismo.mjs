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
import { readdir } from "node:fs/promises";
import path from "node:path";
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
    path.join(path.dirname(new URL(import.meta.url).pathname), "diff.mjs"),
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
const comunes = (
  await readdir(path.join(args.a, "light", "1280").replace(/\/light\/1280$/, ""), {
    recursive: true,
  }).catch(() => [])
).filter((f) => String(f).endsWith(".png")).length;

const m = /(\d+) comparadas · (\d+) con diferencias/.exec(salida);
const total = m ? Number(m[1]) : comunes;
const distintas = m ? Number(m[2]) : -1;

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
