#!/usr/bin/env node
/**
 * Ejecuta un comando con el entorno del proyecto cargado, desde CUALQUIER carpeta de trabajo.
 *
 * Un `git worktree` no lleva los `.env*` (no están versionados, y así debe seguir), así que
 * un `npm run build` desde un clon compila con `NEXT_PUBLIC_*` vacíos: el bundle sale sin
 * URL de Supabase y la app no arranca. Esto resuelve el entorno SIEMPRE contra la carpeta
 * principal y se lo pasa al proceso hijo.
 *
 * Por qué `loadEnvConfig` de `@next/env` y no un parser propio: es EL MISMO cargador que usa
 * Next, así que respeta su precedencia (`.env.$MODE.local` > `.env.local` > `.env.$MODE` >
 * `.env`), sus comillas y sus valores multilínea. Un `. .env.local` de shell no sirve: un
 * valor como `EMAIL_FROM=CARTERA+ <hola@…>` lleva un `<` que zsh interpreta como redirección
 * y revienta antes de cargar nada.
 *
 * **NODE_ENV no se propaga.** `.env.local` tiene `NODE_ENV=development` para el día a día;
 * exportarlo de verdad hace que `next build` compile en modo desarrollo y React se caiga con
 * «Cannot read properties of null (reading 'useContext')» al prerenderizar. Next lo fija él
 * mismo según el comando, así que aquí se omite a propósito.
 *
 * Nunca imprime valores, nunca copia ni escribe ningún `.env*`.
 *
 * Uso:
 *   node scripts/dev/con-env.mjs npm run build
 *   node scripts/dev/con-env.mjs --raiz /ruta/al/proyecto npm run qa:start -- --port 3001
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `@next/env` es CommonJS: `import { loadEnvConfig }` falla con «Named export not found»
// bajo ESM. Se importa el módulo entero y se desestructura.
import nextEnv from "@next/env";

import { candadoVivo } from "../qa/servidor-vivo.mjs";

const { loadEnvConfig } = nextEnv;

const argv = process.argv.slice(2);

/** `--raiz <ruta>` para casos raros; por defecto, la raíz del repo que contiene ESTE archivo. */
let raiz = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
if (argv[0] === "--raiz") {
  const dado = argv[1];
  if (!dado) {
    console.error("con-env: --raiz necesita una ruta");
    process.exit(2);
  }
  raiz = path.resolve(dado);
  argv.splice(0, 2);
}

const [comando, ...args] = argv;
if (!comando) {
  console.error("con-env: falta el comando (ej. `node scripts/dev/con-env.mjs npm run build`)");
  process.exit(2);
}

if (!existsSync(raiz)) {
  console.error(`con-env: la raíz no existe: ${raiz}`);
  process.exit(2);
}

// `loadEnvConfig` escribe en `process.env` del proceso ACTUAL y devuelve lo que cargó.
// `dev = false` porque el caso principal es compilar; con `true` preferiría `.env.development`.
const { loadedEnvFiles } = loadEnvConfig(raiz, false, { info: () => {}, error: () => {} });

// Solo los NOMBRES de los ficheros, jamás una clave ni un valor.
const nombres = loadedEnvFiles.map((f) => path.basename(f.path)).join(", ") || "(ninguno)";
console.error(`con-env: entorno desde ${raiz} · ${nombres}`);

/**
 * Compilar debajo de un servidor congelado vivo deja a ESE servidor sirviendo una carpeta que
 * ya no existe: sigue en pie con su manifiesto en memoria y devuelve 500 en cada chunk. La
 * página llega, el JavaScript no, y la suite entera mide una aplicación sin interactividad —
 * 88 casos en rojo y 1,1 h de corrida que no dicen nada. El servidor no se cae, que es lo que
 * lo vuelve peligroso.
 */
const construye = /\bbuild\b/.test(argv.join(" "));
if (construye) {
  const candado = candadoVivo(raiz);
  if (candado) {
    console.error(
      `con-env: hay un servidor congelado sirviendo ${raiz}\n` +
        `         pid ${candado.pid}, puerto ${candado.puerto}, desde ${candado.desde ?? "?"}.\n` +
        "         Compilar ahora le borra la carpeta bajo los pies: seguiría respondiendo,\n" +
        "         devolviendo 500 en cada chunk, y lo que midas después no vale.\n" +
        "         Pará el servidor primero:  npm run qa:stop",
    );
    process.exit(2);
  }
}

// Ver el comentario de cabecera: propagarlo rompe `next build`.
delete process.env.NODE_ENV;

const hijo = spawn(comando, args, { stdio: "inherit", env: process.env, shell: false });
hijo.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
hijo.on("error", (e) => {
  console.error(`con-env: no se pudo ejecutar «${comando}»: ${e.message}`);
  process.exit(127);
});
