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
 */
import { chromium } from "playwright";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
async function compararEnPagina(page, aUri, bUri, threshold) {
  return page.evaluate(
    async ([a, b, tol]) => {
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

      const salida = new ImageData(w, h);
      let diffPixels = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const dr = Math.abs(da.data[i] - db.data[i]);
        const dg = Math.abs(da.data[i + 1] - db.data[i + 1]);
        const dbl = Math.abs(da.data[i + 2] - db.data[i + 2]);
        const dal = Math.abs(da.data[i + 3] - db.data[i + 3]);
        const distinto = dr > tol || dg > tol || dbl > tol || dal > tol;
        if (distinto) {
          diffPixels++;
          salida.data[i] = 255;
          salida.data[i + 1] = 0;
          salida.data[i + 2] = 0;
          salida.data[i + 3] = 255;
        } else {
          // A al 30 % como fondo: ubica la diferencia sin taparla.
          salida.data[i] = 255 - (255 - da.data[i]) * 0.3;
          salida.data[i + 1] = 255 - (255 - da.data[i + 1]) * 0.3;
          salida.data[i + 2] = 255 - (255 - da.data[i + 2]) * 0.3;
          salida.data[i + 3] = 255;
        }
      }

      let diffPng = null;
      if (diffPixels > 0) {
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
        totalPixels: w * h,
        diffPng,
      };
    },
    [aUri, bUri, threshold],
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

  const filas = [];
  try {
    for (const rel of comunes) {
      const [aUri, bUri] = await Promise.all([
        dataUri(path.join(dirA, rel)),
        dataUri(path.join(dirB, rel)),
      ]);
      const r = await compararEnPagina(page, aUri, bUri, threshold);
      if (r.diffPng) {
        const destino = path.join(outDiff, rel);
        await mkdir(path.dirname(destino), { recursive: true });
        await writeFile(destino, Buffer.from(r.diffPng, "base64"));
      }
      filas.push({
        imagen: rel,
        diffPixels: r.diffPixels,
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

  console.log(`\nimagen${" ".repeat(54)}px distintos       %`);
  console.log("-".repeat(88));
  for (const f of filas.slice(0, 60)) {
    const nombre = f.imagen.length > 58 ? `…${f.imagen.slice(-57)}` : f.imagen.padEnd(58);
    const marca =
      (f.sizeMismatch ? " (tamaño distinto)" : "") + (f.excluida ? " (excluida del estricto)" : "");
    console.log(
      `${nombre} ${String(f.diffPixels).padStart(12)} ${f.pct.toFixed(4).padStart(8)}${marca}`,
    );
  }
  if (filas.length > 60) console.log(`… y ${filas.length - 60} más`);

  const estrictas = conDiff.filter((f) => !f.excluida);
  console.log(
    `\n${comunes.length} comparadas · ${conDiff.length} con diferencias · umbral ${threshold} · máximo permitido ${maxDiffPixels}px`,
  );
  if (excluidos.size) {
    console.log(
      `excluidas del estricto: ${[...excluidos].join(", ")} · ${conDiff.length - estrictas.length} de ellas difieren (no hacen fallar)`,
    );
  }
  if (soloA.length) console.log(`Solo en A (${soloA.length}): ${soloA.slice(0, 5).join(", ")}…`);
  if (soloB.length) console.log(`Solo en B (${soloB.length}): ${soloB.slice(0, 5).join(", ")}…`);
  if (conDiff.length) console.log(`PNGs de diferencias en ${outDiff}/`);

  const falla =
    estrictas.some((f) => f.diffPixels > maxDiffPixels) || soloA.length > 0 || soloB.length > 0;
  process.exit(falla ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
