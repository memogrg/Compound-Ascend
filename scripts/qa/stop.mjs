#!/usr/bin/env node
/**
 * Mata TODOS los servidores de QA de la máquina.
 *
 * Existe porque un servidor olvidado de una ronda anterior no da un error: da una medida falsa.
 * Pasó dos veces la misma tarde. Se compiló un clon, se arrancó `qa:start` en el puerto 3007, el
 * arranque murió con `EADDRINUSE`… y la espera activa con `curl` encontró vivo al servidor VIEJO
 * —de otro worktree y de otro commit— así que la corrida siguió adelante y midió el código
 * equivocado. El síntoma no se parece a la causa: parece un selector que no aparece.
 *
 * ── A QUIÉN BUSCA ───────────────────────────────────────────────────────────
 * Al proceso `scripts/qa/start-frozen.mjs`, que es el ÚNICO eslabón de la cadena que se
 * identifica solo. Lo que arranca `qa:start` es:
 *
 *   node scripts/qa/start-frozen.mjs --port 3009
 *     └─ npm exec next start -p 3009
 *          └─ next-server (v16.3.4)        ← su línea de comando no dice de dónde viene
 *
 * El `--require server-freeze.js` viaja en `NODE_OPTIONS`, no en la línea de comando, así que
 * buscarlo ahí no encuentra nada (primer intento: «no hay servidores de QA corriendo» con tres
 * corriendo). Y `next-server` a secas es indistinguible de cualquier `next start`, así que
 * buscar por ahí mataría el servidor con el que alguien esté trabajando.
 *
 * `start-frozen.mjs` reenvía SIGTERM a su hijo, así que matar al padre baja la cadena entera.
 * Por si algún nieto sobrevive, se comprueba el PUERTO —que se lee de `--port` del propio
 * padre— y se reporta lo que siga escuchando.
 *
 *   npm run qa:stop            (mata y lista qué mató)
 *   npm run qa:stop -- --dry   (solo lista)
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const ejecutar = promisify(execFile);

/** La huella: el único eslabón de la cadena que se identifica solo. */
const HUELLA = "scripts/qa/start-frozen.mjs";

/** Puerto por defecto de `qa:start` cuando no se pasa `--port` (ver start-frozen.mjs). */
const PUERTO_POR_DEFECTO = 3001;

/**
 * Los servidores de QA vivos, con su puerto.
 *
 * Se filtra en JS sobre `ps -eo pid=,command=` y no con `pgrep -f`: el patrón de `pgrep` también
 * se encuentra a sí mismo cuando el comando que lo lanza lleva el patrón en su línea, y eso ya
 * ha matado al proceso que llamaba.
 *
 * @param {string} [ps] Salida de `ps` (para los tests).
 * @returns {Promise<{pid:number, puerto:number, cmd:string}[]>}
 */
export async function servidoresDeQa(ps) {
  const salida = ps ?? (await ejecutar("ps", ["-eo", "pid=,command="])).stdout;
  const fuera = [];
  for (const linea of salida.split("\n")) {
    const t = linea.trim();
    if (!t) continue;
    const m = /^(\d+)\s+(.*)$/.exec(t);
    if (!m) continue;
    const pid = Number(m[1]);
    const cmd = String(m[2]);
    // El propio `qa:stop` (y el `ps` que lo alimenta) mencionan la huella en su línea: fuera.
    if (cmd.includes("scripts/qa/stop.mjs") || cmd.startsWith("ps ")) continue;
    if (!cmd.includes(HUELLA)) continue;
    const p = /--port[= ](\d+)/.exec(cmd);
    fuera.push({ pid, puerto: p ? Number(p[1]) : PUERTO_POR_DEFECTO, cmd });
  }
  return fuera;
}

/** ¿Queda algo escuchando en ese puerto? Devuelve los pids. */
async function escuchando(puerto) {
  try {
    const { stdout } = await ejecutar("lsof", ["-tnP", `-iTCP:${puerto}`, "-sTCP:LISTEN"]);
    return stdout
      .split("\n")
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isInteger(x) && x > 0);
  } catch {
    return []; // lsof sale con 1 cuando no hay nada: eso es «libre».
  }
}

async function main() {
  const soloListar = process.argv.includes("--dry");
  const vivos = await servidoresDeQa();
  if (vivos.length === 0) {
    console.log("  qa:stop · no hay servidores de QA corriendo.");
    return;
  }
  for (const { pid, puerto } of vivos) {
    if (soloListar) {
      console.log(`  qa:stop · (--dry) mataría ${pid} (puerto ${puerto})`);
      continue;
    }
    try {
      process.kill(pid, "SIGTERM");
      console.log(`  qa:stop · matado ${pid} (puerto ${puerto})`);
    } catch (err) {
      console.log(
        `  qa:stop · no se pudo matar ${pid}: ${err instanceof Error ? err.message : "?"}`,
      );
    }
  }
  if (soloListar) return;

  // Un puerto que sigue ocupado después de esto es un nieto que no recibió la señal, y es
  // justo el caso que produce la medida falsa: se mata también, nombrándolo.
  await new Promise((r) => setTimeout(r, 1500));
  for (const { puerto } of vivos) {
    for (const pid of await escuchando(puerto)) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(`  qa:stop · el puerto ${puerto} seguía ocupado por ${pid}: matado`);
      } catch {
        console.log(
          `  qa:stop · ⚠ el puerto ${puerto} sigue ocupado por ${pid} y no se pudo matar`,
        );
      }
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
