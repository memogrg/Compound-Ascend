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
  return c.reprobada ? 0 : c.aprobada ? 1 : c.inestable ? 4 : c.excluida ? 3 : 2;
};
/**
 * Manda el REPORTE, no los ficheros que haya en la carpeta. Una carpeta de diffs reusada
 * conserva los PNG de la corrida anterior, y la página los mostraría como si fueran de esta:
 * 18 filas para 11 cambios. Si no hay reporte —una corrida vieja— se cae a los ficheros y se
 * dice en la página.
 */
/**
 * NO se filtra por «tiene PNG de diferencias».
 *
 * `diff.mjs` no escribe uno cuando las dos capturas miden distinto —no hay dónde restar—, y esta
 * página las descartaba por eso. En la 2.7 eso significó mostrar **4 de 12**: las ocho que
 * faltaban eran precisamente `/gastos` e `/ingresos` a 1280 y 390, o sea las que MÁS cambiaron
 * (el marco nuevo es más alto). La revisión visual se quedaba sin ver justo lo que venía a ver.
 *
 * Ahora entran todas las del reporte, y a las de tamaño distinto se les fabrica el diff acá,
 * rellenando la más corta hasta la altura de la otra.
 */
const cambios = (reporte ? reporte.capturas.map((c) => c.imagen) : pngs).sort(
  (x, y) => rango(x) - rango(y) || x.localeCompare(y),
);
await mkdir(args.out, { recursive: true });

/**
 * El alto de un PNG sin decodificarlo: va en la cabecera IHDR, bytes 20-23 (big-endian).
 *
 * Se lee así y no con una librería porque lo único que hace falta es el número, y estas capturas
 * llegan a 8500 px de alto: decodificar doscientas para leer un entero de cada una es pagar
 * megabytes por nada.
 */
async function altoDe(fichero) {
  try {
    const b = await readFile(fichero);
    return b.length > 24 ? b.readUInt32BE(20) : null;
  } catch {
    return null;
  }
}

/**
 * Fabrica el diff de dos capturas con alturas distintas.
 *
 * Se comparan sobre el lienzo de la MAYOR: lo que solo existe en una de las dos queda marcado
 * entero, que es exactamente lo que pasó —apareció o desapareció contenido—. Sin esto, la captura
 * que más cambió era la única sin imagen de diferencias.
 */
async function diffRellenado(fa, fb, destino) {
  const { PNG } = await import("pngjs");
  const a = PNG.sync.read(await readFile(fa));
  const b = PNG.sync.read(await readFile(fb));
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const out = new PNG({ width: w, height: h });
  const idx = (im, x, y) => (x < im.width && y < im.height ? (y * im.width + x) * 4 : -1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const oa = idx(a, x, y);
      const ob = idx(b, x, y);
      const q = (y * w + x) * 4;
      const distinto =
        oa < 0 ||
        ob < 0 ||
        a.data[oa] !== b.data[ob] ||
        a.data[oa + 1] !== b.data[ob + 1] ||
        a.data[oa + 2] !== b.data[ob + 2];
      out.data[q] = 255;
      out.data[q + 1] = distinto ? 0 : 255;
      out.data[q + 2] = distinto ? 0 : 255;
      out.data[q + 3] = 255;
    }
  await writeFile(destino, PNG.sync.write(out));
}

// Las imágenes se COPIAN al artefacto: una página que apunta a rutas de la máquina de CI no
// se ve en ningún lado después.
const altos = new Map();
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
  const [ha, hb] = await Promise.all([
    altoDe(path.join(args.a, rel)),
    altoDe(path.join(args.b, rel)),
  ]);
  altos.set(rel, { antes: ha, despues: hb });
  // Si no hay diff —tamaños distintos, `diff.mjs` no lo escribe— se fabrica acá.
  const dDiff = path.join(args.out, "diff", rel);
  if ((await altoDe(dDiff)) === null)
    await diffRellenado(path.join(args.a, rel), path.join(args.b, rel), dDiff).catch(() => {});
}

/** `light/390/gastos.png` → tema, ancho y ruta legibles. */
function partes(rel) {
  const [tema = "?", ancho = "?", archivo = rel] = rel.split("/");
  return { tema, ancho, ruta: archivo.replace(/\.png$/, "").replace(/_/g, "/") };
}

/**
 * Cuáles de las aprobadas lo están por TOLERANCIA y no por hash.
 *
 * Importa decirlo: «aprobada» por hash significa que el PNG es el mismo byte a byte; por
 * tolerancia significa que es OTRO PNG y que se miró contra el aprobado con el criterio del
 * veredicto. Lo segundo es una afirmación más débil, y la página no puede presentar las dos con
 * la misma etiqueta sin mentir un poco.
 */
const escaparHtml = (t) =>
  String(t).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

const porTolerancia = new Map(
  (reporte?.aprobadas ?? [])
    .filter((a) => a?.porTolerancia)
    .map((a) => [a.imagen, a.detalle ?? "dentro de tolerancia"]),
);

const filas = cambios
  .map((rel) => {
    const { tema, ancho, ruta } = partes(rel);
    const c = porImagen.get(rel);
    const etiqueta = !c
      ? ""
      : c.reprobada
        ? '<b class="mal">reprobada</b>'
        : c.aprobada
          ? porTolerancia.has(rel)
            ? `<b class="avisa">APROBADA por tolerancia</b> <span class="tenue">${escaparHtml(porTolerancia.get(rel) ?? "")}</span>`
            : '<b class="avisa">APROBADA a mano</b> <span class="tenue">hash idéntico</span>'
          : c.inestable
            ? '<b class="avisa">INESTABLE · fuera del veredicto</b>'
            : c.excluida
              ? '<b class="ok">excluida del estricto</b>'
              : '<b class="ok">bajo el umbral</b>';
    // Un aviso de un vistazo: cuando los tamaños no coinciden, el conteo de píxeles de al
    // lado no significa lo que parece.
    const marcaTamano = c?.["tamañoDistinto"] ? ' <b class="avisa">tamaño distinto</b>' : "";
    const h = altos.get(rel);
    /**
     * La diferencia de ALTURA, en píxeles y con su signo.
     *
     * Cuando dos capturas miden distinto, el conteo de píxeles deja de ser interpretable: el
     * `2403840` de `/gastos` no dice «cambiaron 2,4 millones de píxeles», dice «la página creció y
     * todo lo de abajo se corrió». El número que explica esa fila es cuánto creció.
     */
    const alturas =
      h && h.antes != null && h.despues != null && h.antes !== h.despues
        ? ` · alto ${h.antes} → ${h.despues} px (${h.despues > h.antes ? "+" : ""}${h.despues - h.antes})`
        : "";
    const cifras = c ? `${c.px} px · delta ${c.maxDelta}${alturas}` : alturas.replace(/^ · /, "");
    return `<section>
  <h2>/${ruta} <small>${tema} · ${ancho}px — ${etiqueta}${marcaTamano} <i>${cifras}</i></small></h2>
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
const imagenesInestables = reporte?.inestables ?? [];
let seccionInestables = "";
if (imagenesInestables.length) {
  // Las dos pasadas de cada imagen, copiadas al artefacto. El marcado es por IMAGEN —una pantalla
  // puede ser estable a 1280 e inestable a 768—, así que cada bloque es un par a/b concreto y no
  // «todas las capturas de esta ruta».
  for (const i of imagenesInestables) {
    for (const lado of ["a", "b"]) {
      const destino = path.join(args.out, "sonda", lado, i.imagen);
      await mkdir(path.dirname(destino), { recursive: true });
      await cp(path.join(args.b, "_sonda", lado, i.imagen), destino).catch(() => {});
    }
  }
  const bloques = imagenesInestables
    .map((i) => {
      const { tema, ancho } = partes(i.imagen);
      return `<section>
  <h2>${i.ruta} <small>${tema} · ${ancho}px — <b class="avisa">INESTABLE</b>
    <i>${i.px} px · delta ${i.maxDelta} entre pasadas</i></small></h2>
  <div class="par dos">
    <figure><figcaption>pasada A</figcaption><img loading="lazy" src="sonda/a/${i.imagen}"></figure>
    <figure><figcaption>pasada B</figcaption><img loading="lazy" src="sonda/b/${i.imagen}"></figure>
  </div>
</section>`;
    })
    .join("\n");
  seccionInestables = `<h1 style="margin-top:40px">Capturas inestables (${imagenesInestables.length})</h1>
<p class="resumen">Estas dos imágenes son de la <b>misma compilación</b> y el <b>mismo servidor</b>: lo que
cambie entre ellas no lo cambió el PR. Quedan fuera del veredicto y se muestran para poder arreglar
la causa —o el arnés—, no para ignorarlas.</p>
${bloques}`;
}

/**
 * Las aprobadas a mano se anuncian ARRIBA, no solo con su etiqueta.
 *
 * Quien abre esta página para revisar un cambio tiene que enterarse de que hay capturas que
 * cambiaron y NO cuentan, antes de sacar conclusiones del resumen. Enterrarlo en una etiqueta a
 * mitad de la lista es como no decirlo.
 */
const nAprobadas = (reporte?.aprobadas ?? []).length;
const nTolerancia = porTolerancia.size;
const avisoAprobadas = nAprobadas
  ? `<p class="resumen"><b class="avisa">${nAprobadas} captura(s) aprobadas a mano</b> para este PR
(${nAprobadas - nTolerancia} por hash, ${nTolerancia} por tolerancia): cambiaron a propósito y
quedan fuera del veredicto. La aprobación va atada al PNG «después» de una corrida concreta: si es
idéntico, vale por hash; si no, se compara contra el aprobado con el criterio del veredicto y vale
por tolerancia. Si la pantalla se mueve de verdad, caduca sola.</p>`
  : "";

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
  .tenue { color: #6b7280; font-weight: 400; }
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
${avisoAprobadas}
${filas || "<p>Ninguna captura cambió.</p>"}
${seccionInestables}
</html>`;

await writeFile(path.join(args.out, "comparacion.html"), html);
console.log(`comparación con ${cambios.length} captura(s) en ${args.out}/comparacion.html`);
