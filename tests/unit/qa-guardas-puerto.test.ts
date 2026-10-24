/**
 * Las dos guardas que impiden medir otra cosa: el puerto ocupado y la compilación bajo un
 * servidor vivo.
 *
 * Las dos salen de errores reales, no de imaginar escenarios:
 *
 *  · `qa:start` en un puerto ocupado murió con `EADDRINUSE`, el servidor VIEJO siguió
 *    respondiendo y la corrida midió el commit equivocado.
 *  · `rm -rf .next` con el servidor vivo dejó a ese servidor devolviendo 500 en cada chunk:
 *    la página llegaba y el JavaScript no. 88 casos en rojo que no decían nada.
 */
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, it, expect, afterEach } from "vitest";

// @ts-expect-error — `.mjs` sin tipos: es un script del arnés, no código de la app.
import { puertoOcupado, candadoVivo, marcar, soltar, rutaCandado } from "../../scripts/qa/servidor-vivo.mjs";

const cerrables: Array<() => void> = [];
afterEach(() => {
  for (const c of cerrables.splice(0)) c();
});

function ocupar(puerto: number): Promise<void> {
  const srv = createServer();
  cerrables.push(() => srv.close());
  return new Promise((r) => srv.listen(puerto, "127.0.0.1", () => r()));
}

describe("puertoOcupado", () => {
  it("ve ocupado un puerto con alguien escuchando", async () => {
    await ocupar(45231);
    expect(await puertoOcupado(45231)).toBe(true);
  });

  it("ve libre un puerto sin nadie", async () => {
    expect(await puertoOcupado(45232)).toBe(false);
  });
});

describe("el candado del servidor", () => {
  it("un candado con un pid vivo se ve, y se suelta al terminar", () => {
    const raiz = mkdtempSync(join(tmpdir(), "candado-"));
    marcar(raiz, 3030);
    const c = candadoVivo(raiz);
    expect(c?.puerto).toBe("3030");
    expect(c?.pid).toBe(process.pid);
    soltar(raiz);
    expect(candadoVivo(raiz)).toBeNull();
  });

  it("un candado HUÉRFANO no bloquea para siempre: se ignora y se borra", () => {
    // Si la máquina se apagó a lo bruto, el fichero queda. Un candado que no se puede
    // soltar convierte la guarda en un estorbo y a la siguiente alguien la quita entera.
    const raiz = mkdtempSync(join(tmpdir(), "candado-huerfano-"));
    writeFileSync(rutaCandado(raiz), JSON.stringify({ pid: 999999, puerto: "3030", raiz }));
    expect(candadoVivo(raiz)).toBeNull();
    expect(existsSync(rutaCandado(raiz))).toBe(false);
  });
});

describe("con-env se niega a compilar bajo un servidor vivo", () => {
  it("con el candado puesto, sale con código distinto de 0 y lo explica", () => {
    const raiz = mkdtempSync(join(tmpdir(), "con-env-servido-"));
    writeFileSync(join(raiz, ".env"), "ALGO=1\n");
    writeFileSync(rutaCandado(raiz), JSON.stringify({ pid: process.pid, puerto: "3030", raiz }));
    const r = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/dev/con-env.mjs"), "--raiz", raiz, "npm", "run", "build"],
      { encoding: "utf8" },
    );
    expect(r.status, r.stderr).not.toBe(0);
    expect(r.stderr).toMatch(/servidor|qa:stop/i);
    expect(r.stderr).toContain("3030");
  });

  it("sin candado, compilar no se bloquea", () => {
    const raiz = mkdtempSync(join(tmpdir(), "con-env-libre-"));
    writeFileSync(join(raiz, ".env"), "ALGO=1\n");
    const r = spawnSync(
      process.execPath,
      [join(process.cwd(), "scripts/dev/con-env.mjs"), "--raiz", raiz, "node", "--version"],
      { encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
  });
});
