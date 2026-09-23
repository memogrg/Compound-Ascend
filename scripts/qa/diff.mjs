#!/usr/bin/env node
/**
 * Compara dos corridas de `qa:snap` píxel a píxel, sin dependencias nuevas.
 *
 * El canvas del propio Chromium hace de decodificador de PNG: cada par se carga como data: URI,
 * se dibuja en dos <canvas> y se comparan los `getImageData`. Traer una librería de imágenes solo
 * para esto sería agregar una dependencia a un repo que ya trae un navegador entero.
 *
 * Uso:
 *   node scripts/qa/diff.mjs --a qa-snapshots/base --b qa-snapshots/cambio --out-diff qa-snapshots/diff
 *   node scripts/qa/diff.mjs --a … --b … --threshold 8 --max-diff-pixels 50
 *   node scripts/qa/diff.mjs --a … --b … --exclude home,asistente
 *   node scripts/qa/diff.mjs --a … --b … --exclude home --max-diff-pixels 60 --max-delta 2
 */
import { chromium } from "playwright";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * El conteo vive en `comparar-pixeles.mjs` para poder probarlo sin navegador, y se INYECTA
 * en la página: ahí es donde están los `ImageData`. Se quita el `export` porque la página lo
 * carga como script clásico, no como módulo. Una sola implementación para el arnés y su test.
 */
const FUENTE_CONTEO = (
  await readFile(fileURLToPath(new URL("./comparar-pixeles.mjs", import.meta.url)), "utf8")
).replace(/^export /gm, "");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

/** Todos los .png bajo `dir`, con su ruta relativa (que es la identidad de la captura). */
async function listarPngs(dir) {
  const out = [];
  async function walk(actual) {
    let items;
    try {
      items = await readdir(actual, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const p = path.join(actual, it.name);
      if (it.isDirectory()) await walk(p);
      else if (it.name.endsWith(".png")) out.push(path.relative(dir, p));
    }
  }
  await walk(dir);
  return out.sort();
}

async function dataUri(file) {
  const buf = await readFile(file);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/**
 * Compara dos imágenes dentro del navegador. Devuelve píxeles distintos, total y el PNG de
 * diferencias (A al 30 % con los píxeles distintos en rojo), o `sizeMismatch`.
 */
async function compararEnPagina(page, aUri, bUri, threshold, ignorarDeltaBajo) {
  return page.evaluate(
    async ([a, b, tol, ignorar]) => {
      const cargar = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("no se pudo decodificar el PNG"));
          img.src = src;
        });

      const [ia, ib] = await Promise.all([cargar(a), cargar(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) {
        return {
          sizeMismatch: true,
          a: { w: ia.width, h: ia.height },
          b: { w: ib.width, h: ib.height },
          diffPixels: ia.width * ia.height,
          ignorados: 0,
          maxDelta: 255,
          totalPixels: ia.width * ia.height,
          diffPng: null,
        };
      }

      const w = ia.width;
      const h = ia.height;
      const ca = new OffscreenCanvas(w, h);
      const cb = new OffscreenCanvas(w, h);
      const xa = ca.getContext("2d", { willReadFrequently: true });
      const xb = cb.getContext("2d", { willReadFrequently: true });
      xa.drawImage(ia, 0, 0);
      xb.drawImage(ib, 0, 0);
      const da = xa.getImageData(0, 0, w, h);
      const db = xb.getImageData(0, 0, w, h);

      const { diferentes, ignorados, maxDelta, marcas } = contarDiferencias(da.data, db.data, {
        threshold: tol,
        ignorarDeltaBajo: ignorar,
      });
      const diffPixels = diferentes;

      const salida = new ImageData(w, h);
      for (let p = 0; p < marcas.length; p++) {
        const i = p << 2;
        if (marcas[p] === 1) {
          // Diferencia que CUENTA: rojo.
          salida.data[i] = 255;
          salida.data[i + 1] = 0;
          salida.data[i + 2] = 0;
        } else if (marcas[p] === 2) {
          // Ignorada por antialiasing: ámbar. Se ve dónde está el ruido sin confundirlo con
          // una regresión — si se pintara del color del fondo, la imagen mentiría.
          salida.data[i] = 235;
          salida.data[i + 1] = 170;
          salida.data[i + 2] = 40;
        } else {
          // A al 30 % como fondo: ubica la diferencia sin taparla.
          salida.data[i] = 255 - (255 - da.data[i]) * 0.3;
          salida.data[i + 1] = 255 - (255 - da.data[i + 1]) * 0.3;
          salida.data[i + 2] = 255 - (255 - da.data[i + 2]) * 0.3;
        }
        salida.data[i + 3] = 255;
      }

      let diffPng = null;
      if (diffPixels > 0 || ignorados > 0) {
        const cd = new OffscreenCanvas(w, h);
        cd.getContext("2d").putImageData(salida, 0, 0);
        const blob = await cd.convertToBlob({ type: "image/png" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (const byte of buf) bin += String.fromCharCode(byte);
        diffPng = btoa(bin);
      }

      return {
        sizeMismatch: false,
        diffPixels,
        ignorados,
        maxDelta,
        totalPixels: w * h,
        diffPng,
      };
    },
    [aUri, bUri, threshold, ignorarDeltaBajo],
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dirA = args.a;
  const dirB = args.b;
  if (!dirA || !dirB) {
    console.error("Faltan --a <carpeta> y --b <carpeta>");
    process.exit(2);
  }
  const outDiff = args["out-diff"] ?? "qa-snapshots/diff";
  const threshold = Number(args.threshold ?? 0);
  const maxDiffPixels = Number(args["max-diff-pixels"] ?? 0);
  // Criterio de DOS condiciones. El rasterizado de Chromium deja tiras inestables en los bordes:
  // hasta 51 px con delta 1-2, y cambian de pantalla entre corridas. Tolerarlas por CANTIDAD sola
  // obligaría a subir mucho el margen; tolerarlas bajando --threshold escondería un cambio de color
  // real de 1-2 niveles en cualquier parte. Con las dos juntas, ese ruido pasa y un cambio de CSS
  // real no: mueve miles de píxeles, o mueve pocos pero con delta >= 3.
  const maxDelta = Number(args["max-delta"] ?? 255);
  /**
   * Antialiasing: los píxeles cuyo delta máximo por canal quede POR DEBAJO de este número no
   * cuentan como diferencia. Por defecto 5, medido: la franja del `.m-seg` de
   * `/m/mis-acciones` da ~182 px de valor ≤ 4 entre builds del mismo código, con la misma
   * huella en tres corridas. Es un borde que se redibuja un nivel más claro, no una
   * regresión — y un rojo que hay que ignorar a mano enseña a ignorarlos todos.
   *
   * Los ignorados se siguen CONTANDO y se reportan por ruta: bajar el listón no puede volver
   * el ruido invisible, o dejaríamos de enterarnos si un día crece.
   */
  const ignorarDeltaBajo = Number(args["ignore-delta-below"] ?? 5);
  // Slugs fuera de la comparación ESTRICTA: se comparan y se reportan igual, pero sus diferencias
  // no hacen fallar la salida. Para pantallas con movimiento propio que no cede a reduced-motion.
  const excluidos = new Set(
    String(args.exclude === true ? "" : (args.exclude ?? ""))
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
  );
  /** `light/390/home.png` → `home`. */
  const slugDe = (rel) => path.basename(rel, ".png");

  const [pngsA, pngsB] = await Promise.all([listarPngs(dirA), listarPngs(dirB)]);
  const setB = new Set(pngsB);
  const soloA = pngsA.filter((p) => !setB.has(p));
  const soloB = pngsB.filter((p) => !pngsA.includes(p));
  const comunes = pngsA.filter((p) => setB.has(p));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("about:blank");
  // La función de conteo, inyectada tal cual desde `comparar-pixeles.mjs`.
  await page.addScriptTag({ content: FUENTE_CONTEO });

  const filas = [];
  try {
    for (const rel of comunes) {
      const [aUri, bUri] = await Promise.all([
        dataUri(path.join(dirA, rel)),
        dataUri(path.join(dirB, rel)),
      ]);
      const r = await compararEnPagina(page, aUri, bUri, threshold, ignorarDeltaBajo);
      if (r.diffPng) {
        const destino = path.join(outDiff, rel);
        await mkdir(path.dirname(destino), { recursive: true });
        await writeFile(destino, Buffer.from(r.diffPng, "base64"));
      }
      filas.push({
        imagen: rel,
        diffPixels: r.diffPixels,
        ignorados: r.ignorados ?? 0,
        maxDelta: r.maxDelta ?? 0,
        pct: r.totalPixels ? (r.diffPixels / r.totalPixels) * 100 : 0,
        sizeMismatch: Boolean(r.sizeMismatch),
        excluida: excluidos.has(slugDe(rel)),
      });
    }
  } finally {
    await browser.close();
  }

  filas.sort((x, y) => y.diffPixels - x.diffPixels);
  const conDiff = filas.filter((f) => f.diffPixels > 0);

  console.log(`\nimagen${" ".repeat(54)}px distintos       %  delta`);
  console.log("-".repeat(96));
  for (const f of filas.slice(0, 60)) {
    const nombre = f.imagen.length > 58 ? `…${f.imagen.slice(-57)}` : f.imagen.padEnd(58);
    const marca =
      (f.sizeMismatch ? " (tamaño distinto)" : "") + (f.excluida ? " (excluida del estricto)" : "");
    console.log(
      `${nombre} ${String(f.diffPixels).padStart(12)} ${f.pct.toFixed(4).padStart(8)} ${String(f.maxDelta).padStart(6)}${marca}`,
    );
  }
  if (filas.length > 60) console.log(`… y ${filas.length - 60} más`);

  const estrictas = conDiff.filter((f) => !f.excluida);
  console.log(
    `\n${comunes.length} comparadas · ${conDiff.length} con diferencias · umbral ${threshold} · permitido hasta ${maxDiffPixels}px Y delta ${maxDelta}`,
  );
  const totalIgnorados = filas.reduce((s, f) => s + f.ignorados, 0);
  console.log(
    ignorarDeltaBajo > 0
      ? `antialiasing: ${totalIgnorados} px ignorados por delta < ${ignorarDeltaBajo}` +
          (totalIgnorados
            ? ` · ${filas
                .filter((f) => f.ignorados > 0)
                .sort((x, y) => y.ignorados - x.ignorados)
                .slice(0, 6)
                .map((f) => `${f.imagen} (${f.ignorados})`)
                .join(", ")}`
            : "")
      : "antialiasing: sin filtro (--ignore-delta-below 0)",
  );
  if (excluidos.size) {
    console.log(
      `excluidas del estricto: ${[...excluidos].join(", ")} · ${conDiff.length - estrictas.length} de ellas difieren (no hacen fallar)`,
    );
  }
  if (soloA.length) console.log(`Solo en A (${soloA.length}): ${soloA.slice(0, 5).join(", ")}…`);
  if (soloB.length) console.log(`Solo en B (${soloB.length}): ${soloB.slice(0, 5).join(", ")}…`);
  if (conDiff.length) console.log(`PNGs de diferencias en ${outDiff}/`);

  // Una imagen falla si se pasa de CUALQUIERA de las dos: demasiados píxeles o un delta demasiado
  // grande. El ruido de rasterizado se queda corto en las dos; un cambio real se pasa en alguna.
  const reprobadas = estrictas.filter((f) => f.diffPixels > maxDiffPixels || f.maxDelta > maxDelta);
  if (reprobadas.length) {
    console.log(
      `reprobadas (px > ${maxDiffPixels} o delta > ${maxDelta}): ${reprobadas.map((f) => f.imagen).join(", ")}`,
    );
  }
  const falla = reprobadas.length > 0 || soloA.length > 0 || soloB.length > 0;
  process.exit(falla ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
