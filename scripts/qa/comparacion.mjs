#!/usr/bin/env node
/**
 * La página de comparación: antes y después, lado a lado, SOLO de lo que cambia.
 *
 * Existe porque revisar un cambio visual abriendo doscientos PNG de dos carpetas no se hace
 * — y lo que no se hace, no se revisa. El artefacto de CI trae esta página y quien mira ve
 * en un lote las rutas que se movieron, con su tema y su ancho, sin descargar nada más.
 *
 * Las que NO cambian no salen. Una página con doscientas filas iguales entierra las cuatro
 * que importan, que es la misma razón por la que el diff excluye lo que ya se sabe que se
 * mueve.
 *
 *   node scripts/qa/comparacion.mjs --a <base> --b <rama> --diff <carpeta-de-diffs> \
 *     --out <carpeta> [--titulo "…"]
 */
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1];
    if (v && !v.startsWith("--")) {
      out[k] = v;
      i++;
    } else out[k] = true;
  }
  return out;
}

/** Los PNG que el diff dejó: exactamente las capturas que cambiaron. */
async function pngsDe(dir, base = dir, acc = []) {
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entradas) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await pngsDe(p, base, acc);
    else if (e.name.endsWith(".png")) acc.push(path.relative(base, p));
  }
  return acc;
}

const args = parseArgs(process.argv.slice(2));
for (const req of ["a", "b", "diff", "out"]) {
  if (!args[req]) {
    console.error(`Falta --${req}`);
    process.exit(2);
  }
}

const pngs = (await pngsDe(args.diff)).sort();

/**
 * El veredicto de cada captura sale del reporte del diff, no de que exista su PNG.
 *
 * Sin esto la página mezclaba las REPROBADAS con las que solo movieron antialiasing y con las
 * excluidas del estricto: 18 filas iguales en apariencia para 9 que importan. Enterrar lo que
 * importa entre lo que no es la forma más común de que una revisión visual no se haga.
 */
const reporte = await readFile(path.join(args.diff, "reporte.json"), "utf8")
  .then((t) => JSON.parse(t))
  .catch(() => null);
const porImagen = new Map((reporte?.capturas ?? []).map((c) => [c.imagen, c]));
const rango = (rel) => {
  const c = porImagen.get(rel);
  if (!c) return 2;
  return c.reprobada ? 0 : c.inestable ? 3 : c.excluida ? 2 : 1;
};
/**
 * Manda el REPORTE, no los ficheros que haya en la carpeta. Una carpeta de diffs reusada
 * conserva los PNG de la corrida anterior, y la página los mostraría como si fueran de esta:
 * 18 filas para 11 cambios. Si no hay reporte —una corrida vieja— se cae a los ficheros y se
 * dice en la página.
 */
const cambios = (reporte ? reporte.capturas.map((c) => c.imagen) : pngs)
  .filter((rel) => pngs.includes(rel))
  .sort((x, y) => rango(x) - rango(y) || x.localeCompare(y));
await mkdir(args.out, { recursive: true });

// Las imágenes se COPIAN al artefacto: una página que apunta a rutas de la máquina de CI no
// se ve en ningún lado después.
for (const rel of cambios) {
  for (const [lado, origen] of [
    ["antes", args.a],
    ["despues", args.b],
    ["diff", args.diff],
  ]) {
    const destino = path.join(args.out, lado, rel);
    await mkdir(path.dirname(destino), { recursive: true });
    await cp(path.join(origen, rel), destino).catch(() => {});
  }
}

/** `light/390/gastos.png` → tema, ancho y ruta legibles. */
function partes(rel) {
  const [tema = "?", ancho = "?", archivo = rel] = rel.split("/");
  return { tema, ancho, ruta: archivo.replace(/\.png$/, "").replace(/_/g, "/") };
}

const filas = cambios
  .map((rel) => {
    const { tema, ancho, ruta } = partes(rel);
    const c = porImagen.get(rel);
    const etiqueta = !c
      ? ""
      : c.reprobada
        ? '<b class="mal">reprobada</b>'
        : c.inestable
          ? '<b class="avisa">INESTABLE · fuera del veredicto</b>'
          : c.excluida
            ? '<b class="ok">excluida del estricto</b>'
            : '<b class="ok">bajo el umbral</b>';
    const cifras = c ? `${c.px} px · delta ${c.maxDelta}` : "";
    return `<section>
  <h2>/${ruta} <small>${tema} · ${ancho}px — ${etiqueta} <i>${cifras}</i></small></h2>
  <div class="par">
    <figure><figcaption>antes</figcaption><img loading="lazy" src="antes/${rel}"></figure>
    <figure><figcaption>después</figcaption><img loading="lazy" src="despues/${rel}"></figure>
    <figure><figcaption>diferencia</figcaption><img loading="lazy" src="diff/${rel}"></figure>
  </div>
</section>`;
  })
  .join("\n");

/**
 * Las rutas que la sonda marcó inestables, con LAS DOS TANDAS a la vista.
 *
 * Decirle a alguien «esta pantalla es inestable» y nada más no es accionable: hay que poder ver
 * qué se mueve entre dos capturas de la MISMA compilación —un número que anima, una fecha que
 * se coló, un gráfico que no terminó— para decidir si se arregla la pantalla o el arnés. Las
 * imágenes las dejó `marcar-inestables.mjs` dentro del artefacto de la rama, bajo `_sonda/a|b`.
 */
const rutasInestables = reporte?.inestables ?? [];
let seccionInestables = "";
if (rutasInestables.length) {
  const porRuta = new Map();
  for (const rel of await pngsDe(path.join(args.b, "_sonda", "a"))) porRuta.set(rel, true);
  for (const rel of porRuta.keys()) {
    for (const lado of ["a", "b"]) {
      const destino = path.join(args.out, "sonda", lado, rel);
      await mkdir(path.dirname(destino), { recursive: true });
      await cp(path.join(args.b, "_sonda", lado, rel), destino).catch(() => {});
    }
  }
  const bloques = rutasInestables
    .map((i) => {
      const suyas = [...porRuta.keys()].filter(
        (rel) => partes(rel).ruta === i.ruta.replace(/^\//, ""),
      );
      const pares = suyas
        .map(
          (rel) => `<div class="par dos">
    <figure><figcaption>tanda A</figcaption><img loading="lazy" src="sonda/a/${rel}"></figure>
    <figure><figcaption>tanda B</figcaption><img loading="lazy" src="sonda/b/${rel}"></figure>
  </div>`,
        )
        .join("\n");
      return `<section>
  <h2>${i.ruta} <small><b class="avisa">INESTABLE</b> <i>hasta ${i.px} px · delta ${i.maxDelta} entre tandas</i></small></h2>
  ${pares || "<p>Sin imágenes de las tandas en el artefacto.</p>"}
</section>`;
    })
    .join("\n");
  seccionInestables = `<h1 style="margin-top:40px">Rutas inestables (${rutasInestables.length})</h1>
<p class="resumen">Estas dos capturas son de la <b>misma compilación</b> y el <b>mismo servidor</b>: lo que
cambie entre ellas no lo cambió el PR. Quedan fuera del veredicto y se muestran para poder arreglar
la causa —o el arnés—, no para ignorarlas.</p>
${bloques}`;
}

const titulo = typeof args.titulo === "string" ? args.titulo : "Comparación visual";
const html = `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 24px; font: 14px/1.5 system-ui, sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .resumen { color: #666; margin-bottom: 24px; }
  section { margin-bottom: 32px; border-top: 1px solid #ccc; padding-top: 16px; }
  h2 { font-size: 15px; margin: 0 0 10px; }
  h2 small { color: #666; font-weight: 400; }
  .mal { color: #b14844; }
  .ok { color: #32784a; }
  .avisa { color: #8f6325; }
  .par.dos { grid-template-columns: repeat(2, 1fr); }
  h2 i { color: #888; font-style: normal; }
  .par { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: start; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: #666; margin-bottom: 4px; }
  img { width: 100%; border: 1px solid #ddd; }
  @media (max-width: 900px) { .par { grid-template-columns: 1fr; } }
</style>
<h1>${titulo}</h1>
<p class="resumen">${cambios.length} captura(s) con diferencias, de ${reporte?.comparadas ?? "?"} comparadas · ${
  cambios.filter((r) => porImagen.get(r)?.reprobada).length
} reprobada(s), primero. Las que no cambian no salen.</p>
${filas || "<p>Ninguna captura cambió.</p>"}
${seccionInestables}
</html>`;

await writeFile(path.join(args.out, "comparacion.html"), html);
console.log(`comparación con ${cambios.length} captura(s) en ${args.out}/comparacion.html`);
