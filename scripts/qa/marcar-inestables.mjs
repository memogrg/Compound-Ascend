#!/usr/bin/env node
/**
 * Lleva el hallazgo de la sonda desde el job de capturas hasta el del diff.
 *
 * Los dos jobs no comparten disco: lo único que viaja entre ellos es el artefacto de capturas.
 * Así que lo que la sonda descubrió —qué rutas no salen iguales dos veces seguidas contra la
 * MISMA compilación— tiene que entrar ahí, o el diff visual no puede excluirlas de su veredicto
 * y volvería a culpar al PR de una pantalla que se mueve sola.
 *
 * Dos cosas al manifiesto y una al disco:
 *   - `rutasInestables` en `capturas/manifest.json`, con su px y su delta.
 *   - las imágenes de esas rutas, de las DOS tandas, bajo `capturas/_sonda/a|b/`. Sin ellas
 *     `comparacion.html` podría decir «esta ruta es inestable» y nada más, que es justo el
 *     tipo de aviso que nadie puede accionar.
 *
 *   node scripts/qa/marcar-inestables.mjs --capturas capturas --inestables diff-determinismo/inestables.json \
 *     --tanda-a det-a --tanda-b det-b
 */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) {
      args[k] = v;
      i++;
    } else args[k] = true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const dirCapturas = args.capturas ?? "capturas";
const fInestables = args.inestables ?? "diff-determinismo/inestables.json";

const datos = JSON.parse(await readFile(fInestables, "utf8").catch(() => "null"));
if (!datos) {
  // Sin fichero no hay nada que marcar. No es un fallo: la sonda pudo no haber corrido en este
  // shard. Se dice y se sale en verde, en vez de dejar un manifiesto a medio escribir.
  console.log(`sin ${fInestables}: no hay rutas inestables que marcar`);
  process.exit(0);
}

const inestables = datos.inestables ?? [];
const fManifest = path.join(dirCapturas, "manifest.json");
const manifest = JSON.parse(await readFile(fManifest, "utf8"));
manifest.rutasInestables = inestables.map((i) => ({
  ruta: i.ruta,
  px: i.px,
  maxDelta: i.maxDelta,
}));
await writeFile(fManifest, JSON.stringify(manifest, null, 2));

// Las dos tandas, solo de las rutas señaladas: copiar las 20 enteras serían megas por nada.
let copiadas = 0;
for (const [etiqueta, dir] of [
  ["a", args["tanda-a"] ?? "det-a"],
  ["b", args["tanda-b"] ?? "det-b"],
]) {
  for (const i of inestables) {
    for (const img of i.imagenes ?? []) {
      const destino = path.join(dirCapturas, "_sonda", etiqueta, img);
      await mkdir(path.dirname(destino), { recursive: true });
      try {
        await copyFile(path.join(dir, img), destino);
        copiadas++;
      } catch {
        // La imagen puede no existir si la sonda y la tanda no coinciden; se dice al final.
      }
    }
  }
}

console.log(
  `marcadas ${inestables.length} ruta(s) inestable(s) en ${fManifest}` +
    (inestables.length ? ` (${inestables.map((i) => i.ruta).join(", ")})` : "") +
    ` · ${copiadas} imagen(es) de las dos tandas copiadas a ${dirCapturas}/_sonda/`,
);
