/**
 * `qa:stop` — a quién mata y, sobre todo, a quién NO.
 *
 * Existe por dos medidas falsas de la misma tarde: un servidor de QA olvidado de una ronda
 * anterior seguía escuchando en el puerto, el `qa:start` nuevo murió con `EADDRINUSE`, y la
 * espera activa con `curl` encontró vivo al viejo —otro worktree, otro commit— así que la
 * corrida siguió y midió el código equivocado. El síntoma no se parece a la causa.
 *
 * Los dos peligros de un matador por patrón son matar de más (el `next dev` con el que alguien
 * está trabajando) y matarse a sí mismo (el patrón aparece en su propia línea de comando). Los
 * dos están abajo.
 */
import { describe, it, expect } from "vitest";

// prettier-ignore
// @ts-expect-error — .mjs sin tipos
import { servidoresDeQa } from "../../scripts/qa/stop.mjs";

/**
 * Salida de `ps` COPIADA de la máquina con tres servidores de QA vivos. Importa que sea la de
 * verdad: el primer intento buscaba `--require …/server-freeze.js`, que viaja en `NODE_OPTIONS`
 * y no en la línea de comando, así que no encontraba nada teniendo tres corriendo.
 */
const PS = [
  "  242 node scripts/dev/con-env.mjs --raiz /Users/memogrg/Compound Ascend v1 npm run qa:start -- --port 3001",
  "  276 node scripts/qa/start-frozen.mjs --port 3001",
  "  293 npm exec next start -p 3001",
  "  325 next-server (v16.3.4)",
  "31028 node scripts/qa/start-frozen.mjs --port 3008",
  "31068 next-server (v16.3.4)",
  "33732 node scripts/qa/start-frozen.mjs --port 3009",
  "33764 next-server (v16.3.4)",
  " 2001 next dev",
  " 2002 node /Users/x/repo/node_modules/.bin/next start -p 3000",
  " 3001 node /Users/x/repo/scripts/qa/stop.mjs",
  " 3002 ps -eo pid=,command=",
  " 4001 node scripts/qa/snap.mjs --base-url http://localhost:3009 --out ../qa-snapshots/det-B",
].join("\n");

describe("qa:stop", () => {
  it("mata los servidores congelados de QA, de cualquier worktree, con su puerto", async () => {
    const vivos = await servidoresDeQa(PS);
    expect(vivos.map((p: { pid: number }) => p.pid)).toEqual([276, 31028, 33732]);
    // El puerto sale del propio `--port`, y sirve para comprobar después que quedó libre.
    expect(vivos.map((p: { puerto: number }) => p.puerto)).toEqual([3001, 3008, 3009]);
  });

  it("no mata a `next-server` a secas: su línea no dice de dónde viene", async () => {
    // Es el nieto. Matar al padre baja la cadena; buscar por «next-server» mataría también el
    // servidor con el que alguien esté trabajando.
    const pids = (await servidoresDeQa(PS)).map((p: { pid: number }) => p.pid);
    for (const nieto of [325, 31068, 33764]) expect(pids).not.toContain(nieto);
  });

  it("ni al envoltorio de npm, para no matar dos veces la misma cadena", async () => {
    const pids = (await servidoresDeQa(PS)).map((p: { pid: number }) => p.pid);
    expect(pids).not.toContain(242);
    expect(pids).not.toContain(293);
  });

  it("no toca un `next dev`, ni un `next start` que no sea de QA", async () => {
    const pids = (await servidoresDeQa(PS)).map((p: { pid: number }) => p.pid);
    expect(pids).not.toContain(2001);
    expect(pids).not.toContain(2002);
    // Ni el `next-server` a secas, cuya línea no dice de dónde viene.
    expect(pids).not.toContain(325);
  });

  it("no se mata a sí mismo ni al `ps` que lo alimenta", async () => {
    // El patrón aparece en la línea de comando del propio `qa:stop`. Un `pgrep -f` se
    // encontraría a sí mismo y el comando se suicidaría antes de matar a nadie.
    const pids = (await servidoresDeQa(PS)).map((p: { pid: number }) => p.pid);
    expect(pids).not.toContain(3001);
    expect(pids).not.toContain(3002);
  });

  it("tampoco mata a quien está capturando", async () => {
    // `qa:snap` no es un servidor: matarlo dejaría una carpeta de capturas a medias que el
    // diff compararía como si estuviera completa.
    const pids = (await servidoresDeQa(PS)).map((p: { pid: number }) => p.pid);
    expect(pids).not.toContain(4001);
  });
});
