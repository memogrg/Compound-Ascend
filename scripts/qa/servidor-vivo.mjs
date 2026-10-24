#!/usr/bin/env node
/**
 * Quién está sirviendo qué: el candado del servidor congelado.
 *
 * Existe por dos medidas falsas que costaron horas, las dos del mismo tipo — el arnés no
 * falló, midió otra cosa:
 *
 *  1. Se arrancó `qa:start` en un puerto ocupado. El arranque murió con `EADDRINUSE`, el
 *     servidor VIEJO —de otro commit— siguió respondiendo, y la corrida siguió adelante
 *     midiendo el código equivocado. El síntoma no se parece a la causa: parece un selector.
 *  2. Se hizo `rm -rf .next` con un servidor sirviendo esa carpeta. El servidor siguió vivo
 *     con su manifiesto en memoria y devolvió 500 en cada chunk: la página llegaba, el
 *     JavaScript no. 88 casos en rojo y una suite de 1,1 h que no medía nada.
 *
 * El candado es un fichero con el pid, el puerto y la carpeta. `start-frozen.mjs` lo escribe
 * al arrancar y lo borra al salir; `con-env.mjs` lo mira antes de compilar.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createConnection } from "node:net";

/** El candado vive en la raíz que sirve, para que cada worktree tenga el suyo. */
export function rutaCandado(raiz) {
  return path.join(raiz, ".qa-servidor.json");
}

/** @returns {{pid:number, puerto:string, raiz:string, desde:string}|null} */
export function candadoVivo(raiz) {
  const p = rutaCandado(raiz);
  if (!existsSync(p)) return null;
  let datos;
  try {
    datos = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
  // Un candado huérfano —la máquina se apagó a lo bruto— no puede bloquear para siempre.
  if (!datos?.pid || !procesoVivo(datos.pid)) {
    try {
      unlinkSync(p);
    } catch {
      /* ya no está */
    }
    return null;
  }
  return datos;
}

/** `kill(pid, 0)` no mata: pregunta si existe y si se puede señalar. */
export function procesoVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

export function marcar(raiz, puerto) {
  writeFileSync(
    rutaCandado(raiz),
    JSON.stringify({
      pid: process.pid,
      puerto: String(puerto),
      raiz,
      desde: new Date().toISOString(),
    }),
  );
}

export function soltar(raiz) {
  try {
    unlinkSync(rutaCandado(raiz));
  } catch {
    /* ya no está */
  }
}

/**
 * ¿Hay alguien escuchando en ese puerto? Se intenta CONECTAR, no ocupar: ocupar y soltar
 * deja una ventana en la que otro se mete, y este arnés ya sabe lo que cuesta una ventana.
 *
 * @returns {Promise<boolean>}
 */
export function puertoOcupado(puerto, host = "127.0.0.1", msTope = 800) {
  return new Promise((resolve) => {
    const sock = createConnection({ port: Number(puerto), host });
    const fin = (ocupado) => {
      sock.destroy();
      resolve(ocupado);
    };
    sock.setTimeout(msTope);
    sock.once("connect", () => fin(true));
    sock.once("timeout", () => fin(false));
    sock.once("error", () => fin(false));
  });
}
