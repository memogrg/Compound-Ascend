#!/usr/bin/env node
/**
 * Levanta `next start` con el reloj del SERVIDOR congelado y la red externa cortada.
 *
 * El `--freeze` de snap.mjs solo congela el navegador; lo que la app calcula en el
 * servidor —la fecha del primer cobro, los precios de mercado en vivo— seguía corriendo
 * con el reloj real, y una base del 18-sep ya no coincidía con una comparación del 20.
 *
 * Uso:
 *   npm run qa:start                                  (hoy 12:00 America/Costa_Rica)
 *   npm run qa:start -- --freeze 2026-09-18T18:00:00Z
 *   QA_FREEZE=2026-09-18T18:00:00Z npm run qa:start
 *
 * La captura tiene que usar EL MISMO instante; el comando exacto se imprime al arrancar.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { instanteCongelado } from "./snap.mjs";

const aquí = path.dirname(fileURLToPath(import.meta.url));
const preload = path.join(aquí, "server-freeze.js");

function argumento(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : undefined;
}

const puerto = argumento("port") ?? "3001";
// instanteCongelado ya resuelve la precedencia --freeze > QA_FREEZE > hoy 12:00 CR.
const congelado = instanteCongelado(argumento("freeze")).toISOString();

// TZ=UTC porque Vercel corre en UTC: la captura tiene que reproducir producción, no la
// zona de la máquina. La zona del USUARIO la resuelve la app por cookie/perfil.
const env = {
  ...process.env,
  QA_FREEZE: congelado,
  QA_BLOCK_EXTERNAL: "1",
  TZ: "UTC",
  // La ruta va ENTRECOMILLADA: NODE_OPTIONS se parte por espacios, y este repo vive en
  // "/Users/…/Compound Ascend v1". Sin comillas, Node busca "/Users/memogrg/Compound".
  NODE_OPTIONS: `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ""}--require "${preload}"`,
};

console.log(`\n  instante congelado: ${congelado}`);
console.log(`  servidor:           http://localhost:${puerto} (TZ=UTC, red externa bloqueada)`);
console.log(`\n  Capturá con el MISMO instante, en otra terminal:\n`);
console.log(`    QA_FREEZE=${congelado} \\`);
console.log(`      E2E_EMAIL=… E2E_PASSWORD=… npm run qa:snap -- --out qa-snapshots/<nombre>\n`);

const hijo = spawn("npx", ["next", "start", "-p", puerto], { stdio: "inherit", env });

for (const señal of ["SIGINT", "SIGTERM"]) {
  process.on(señal, () => hijo.kill(señal));
}
hijo.on("exit", (code, señal) => {
  if (señal) process.kill(process.pid, señal);
  else process.exit(code ?? 0);
});
