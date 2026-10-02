#!/usr/bin/env node
/**
 * ¿Dos capturas de la MISMA compilación contra el MISMO servidor salen iguales?
 *
 * Existe porque en CI se retira `--deterministic-mode` —ahí no produce fotogramas— y esa
 * bandera era justamente la que prometía repetibilidad. Quitarla y confiar sería cambiar una
 * garantía por una suposición; esto la vuelve a demostrar donde importa, en el mismo job y
 * sobre las mismas pantallas.
 *
 * Compara las DOS pasadas que hace el job de capturas sobre las MISMAS rutas y las MISMAS seis
 * combinaciones (2 temas × 3 anchos). Antes miraba una lista aparte de 20 rutas en `light/1280`,
 * y eso dejaba un agujero que costó un PR ajeno: `/mi-base-financiera` parpadeó en `light/768`,
 * la sonda dio 0/20 porque ese ancho no lo miraba, la imagen nunca se marcó inestable, y su
 * diferencia aterrizó como reprobada a nombre del PR de postcss (#892), que no había tocado nada.
 *
 * Lo que detecta y lo que se compara ahora son el MISMO conjunto. Y sale más barato de lo que
 * parece: la segunda pasada son ~50 capturas por shard contra las ~40 de la sonda vieja — +10,
 * un 11 %, porque la lista aparte tenía su propio coste.
 *
 * Qué hace con lo que encuentra, y por qué cambió: al principio CUALQUIER ruta inestable
 * tumbaba el job. Eso confunde dos cosas distintas —«esta pantalla no se puede medir» y «el
 * arnés está roto»— y le entrega a una sola ruta el poder de bloquear todos los PR, que es
 * exactamente cómo una guarda se gana que la desactiven. Ahora las NOMBRA: escribe
 * `inestables.json` con las rutas que difieren entre sus dos tandas, y el job sigue. El diff
 * visual las excluye de su veredicto y las lista aparte, con las dos tandas a la vista, para
 * que se vea qué se mueve en vez de adivinarlo.
 *
 * El tope sigue existiendo: más de `--tope` rutas inestables (2 por defecto) ya no es una
 * pantalla rara, es el arnés perdiendo repetibilidad, y entonces sí falla.
 *
 * NO se ajustan los umbrales del diff: siguen en cero. Una ruta inestable no es una ruta que
 * se compara con más manga ancha, es una ruta que NO se compara y se dice.
 *
 *   node scripts/qa/sonda-determinismo.mjs --a <tanda1> --b <tanda2> [--tope 2]
 */
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const outDiff = args["out-diff"] ?? "diff-determinismo";
const tope = Number(args.tope ?? 2);

/**
 * De `light/1280/mi-base-financiera.png` a `/mi-base-financiera`.
 *
 * El mapeo sale del manifiesto de la tanda, no del nombre del fichero: el slug es una
 * transformación con pérdida (`/patrimonio/proteccion` → `patrimonio_proteccion`) y
 * reconstruir la ruta a mano sería adivinar. El manifiesto ya guarda las dos.
 */
async function rutasPorImagen(dir) {
  const mapa = new Map();
  try {
    const man = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    for (const e of man.entries ?? []) if (e.file && e.route) mapa.set(e.file, e.route);
  } catch {
    /* sin manifiesto se cae al nombre del fichero, abajo */
  }
  return mapa;
}

let inestables = [];
if (distintas !== 0) {
  const reporte = JSON.parse(
    await readFile(path.join(outDiff, "reporte.json"), "utf8").catch(() => "null"),
  );
  const mapa = await rutasPorImagen(args.a);

  /**
   * Se marca por IMAGEN, no por ruta.
   *
   * Una pantalla puede ser estable a 1280 e inestable a 768 —medido en `/mi-base-financiera`—, y
   * sacar del veredicto las seis capturas de una ruta porque una parpadeó es dejar de mirar cinco
   * que sí se podían comparar. Lo que no se puede comparar es la imagen concreta.
   */
  inestables = (reporte?.capturas ?? [])
    .filter((c) => c.px > 0)
    .map((c) => ({
      imagen: c.imagen,
      ruta: mapa.get(c.imagen) ?? `?${path.basename(c.imagen, ".png")}`,
      px: c.px,
      maxDelta: c.maxDelta,
    }))
    .sort((x, y) => y.px - x.px);

  console.log("\nimágenes inestables (difieren entre dos pasadas de la MISMA compilación):");
  for (const i of inestables)
    console.log(`  ${i.imagen}  ·  ${i.ruta}  ·  ${i.px} px  ·  delta ${i.maxDelta}`);
}

// Por si `diff.mjs` no la dejó (no debería, pero esto ya falló una vez y el síntoma —ENOENT
// en un job de 16 minutos— no vale lo que cuesta volver a verlo).
await mkdir(outDiff, { recursive: true });
await writeFile(
  path.join(outDiff, "inestables.json"),
  JSON.stringify(
    { generadoEn: new Date().toISOString(), tope, comparadas: total, inestables },
    null,
    2,
  ),
);

if (inestables.length > tope) {
  console.error(
    `::error::${inestables.length} imágenes inestables, más del tope de ${tope}. ` +
      "Una captura rara se nombra y se sigue; esto ya es el arnés perdiendo repetibilidad, " +
      "y entonces las capturas no sirven como evidencia. No se ajusta el umbral.",
  );
  process.exit(1);
}
if (inestables.length > 0) {
  console.log(
    `\n⚠ ${inestables.length} imagen(es) inestable(s), dentro del tope de ${tope}: quedan FUERA del ` +
      "veredicto del diff visual y se listan aparte, con sus dos tandas, en comparacion.html.",
  );
}
