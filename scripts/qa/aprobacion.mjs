#!/usr/bin/env node
/**
 * La lista de capturas que Memo aprobó a mano para UN PR.
 *
 * Existe por un caso real: el PR que cambia el correo de la cuenta demo mueve, a propósito,
 * `/configuracion` y `/m/perfil`. El diff visual las reprueba —y hace bien—, pero no tenía forma
 * de registrar «esto lo miré y está bien», así que el único camino era mergear en rojo. Un job
 * que solo sabe decir que no acaba ignorándose.
 *
 * Tres decisiones que hacen que esto no se convierta en un sello de goma:
 *
 *   1. **Se aprueba un PNG, no una ruta.** Cada entrada lleva el sha256 del fichero «después»
 *      exacto, y el fichero anota `corrida`: el id de la corrida de la que salieron esos hashes.
 *      Si la pantalla vuelve a cambiar, la aprobación caduca sola; no hay forma de aprobar
 *      `/configuracion` «en general». Cuando el hash no casa se compara la IMAGEN aprobada
 *      —bajada de esa corrida— contra la de ahora, porque los PNG no son byte a byte
 *      reproducibles y el hash solo hacía caducar aprobaciones por ruido (ver `cotejar`).
 *   2. **Se aprueba para UN PR.** El campo `pr` tiene que coincidir con el PR que corre. Un
 *      fichero olvidado en la rama no vale para el siguiente cambio.
 *   3. **En `main` no se lee.** Las aprobaciones son para comparar una rama contra su base; una
 *      base no se aprueba.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Dónde vive, relativo a la raíz del repo. */
export const RUTA_APROBACION = "qa/visual-aprobado.json";

/** El sha256 de un fichero, en hexadecimal. */
export async function sha256De(fichero) {
  return createHash("sha256")
    .update(await readFile(fichero))
    .digest("hex");
}

/**
 * `light/1280/configuracion.png` → `{ tema, ancho, archivo }`.
 *
 * El nombre del fichero ES la identidad de la captura en todo el arnés; se parte acá una sola vez
 * para que la aprobación se escriba con campos legibles y no con una cadena que hay que adivinar.
 */
export function partesDeImagen(rel) {
  const [tema, ancho, archivo] = rel.split("/");
  return { tema: tema ?? "", ancho: Number(ancho ?? 0), archivo: archivo ?? rel };
}

/** De `{ ruta, tema, ancho }` a `light/1280/configuracion.png`. */
export function imagenDeEntrada(e) {
  const slug = String(e.ruta ?? "")
    .replace(/^\//, "")
    .replace(/\//g, "_");
  return `${e.tema}/${e.ancho}/${slug || "home"}.png`;
}

/**
 * Compara lo que el diff reprobó contra lo aprobado.
 *
 * Devuelve las listas que importan, y ninguna es un detalle:
 *   - `aprobadas`: reprobadas cubiertas por una aprobación. Salen del veredicto.
 *   - `sinAprobar`: reprobadas que nadie aprobó. Hacen fallar.
 *   - `caducadas`: aprobaciones que ya no corresponden a lo que se ve, o que sobran porque esa
 *     captura ya no se reprueba. También hacen fallar: una aprobación que no se corresponde con
 *     nada es una que alguien copió de otro PR, y dejarla pasar en silencio vacía el mecanismo.
 *
 * ## Por qué el hash solo no alcanza (decisión 52)
 *
 * El sha256 es byte a byte, y las capturas no son byte a byte reproducibles. Medido en la corrida
 * `37038208517`: de las 12 aprobadas de la 2.7, **11 casaron y 1 no** —`light/390/ingresos.png`—
 * entre dos corridas cuyo único cambio era el propio fichero de aprobación, que no pinta nada. Es
 * decir: la aprobación caducaba por el ruido del renderizador, no porque la pantalla cambiara. Un
 * mecanismo que caduca solo por eso obliga a reaprobar en cada corrida, y eso es lo mismo que no
 * tener mecanismo.
 *
 * Así que cuando el hash no casa se mira la IMAGEN: el PNG que se aprobó contra el de ahora, con
 * el mismo criterio del veredicto (`veredicto.mjs`, importado — no una copia). Dentro de
 * tolerancia es la misma pantalla con otro ruido: «aprobada por tolerancia», y se dice. Fuera, la
 * pantalla se movió de verdad y la aprobación caduca.
 *
 * `compararConAprobada(img)` es quien hace esa lectura; se inyecta para que esto siga siendo
 * puro y la decisión se pueda probar sin navegador ni red. Devuelve
 * `{ estado: "dentro" | "fuera" | "sin-artefacto" | "sin-imagen", detalle? }`. Si no se pasa, el
 * comportamiento es el de antes: hash que no casa, aprobación caducada.
 */
export async function cotejar({ reprobadas, aprobacion, hashes, pr, compararConAprobada }) {
  if (!aprobacion)
    return { aprobadas: [], sinAprobar: reprobadas, caducadas: [], porTolerancia: [], prOk: true };
  const prOk = Number(aprobacion.pr) === Number(pr);
  const porImagen = new Map((aprobacion.capturas ?? []).map((e) => [imagenDeEntrada(e), e]));

  const aprobadas = [];
  const sinAprobar = [];
  const porTolerancia = [];
  const caducadas = [];
  /** Las que el hash no cubrió y la tolerancia tampoco: se nombran una sola vez. */
  const rechazadas = new Map();

  for (const img of reprobadas) {
    const e = porImagen.get(img);
    if (!prOk || !e) {
      sinAprobar.push(img);
      continue;
    }
    if (e.sha256_despues === hashes.get(img)) {
      aprobadas.push(img);
      continue;
    }
    if (!compararConAprobada) {
      sinAprobar.push(img);
      rechazadas.set(img, "el hash no coincide");
      continue;
    }
    const r = await compararConAprobada(img);
    if (r?.estado === "dentro") {
      aprobadas.push(img);
      porTolerancia.push({ imagen: img, detalle: r.detalle ?? "" });
      continue;
    }
    sinAprobar.push(img);
    rechazadas.set(img, motivoDeRechazo(r, aprobacion));
  }

  const reprobadasSet = new Set(reprobadas);
  for (const [img] of porImagen) {
    if (!reprobadasSet.has(img)) caducadas.push({ imagen: img, motivo: "ya no se reprueba" });
    else if (rechazadas.has(img)) caducadas.push({ imagen: img, motivo: rechazadas.get(img) });
  }
  return { aprobadas, sinAprobar, caducadas, porTolerancia, prOk };
}

/**
 * El motivo que se escribe cuando la tolerancia no salva la aprobación.
 *
 * Los cuatro casos se nombran distinto a propósito: «la pantalla se movió» y «no pude mirar» piden
 * cosas opuestas a quien lee —reaprobar en el primero, volver a aprobar con una corrida viva en el
 * segundo— y confundirlos manda a cambiar lo que no hay que cambiar.
 */
function motivoDeRechazo(r, aprobacion) {
  const corrida = aprobacion?.corrida ? `corrida ${aprobacion.corrida}` : "corrida sin anotar";
  switch (r?.estado) {
    case "fuera":
      return `el hash no coincide y la imagen tampoco: ${r.detalle || "fuera de tolerancia"}`;
    case "sin-imagen":
      return `el hash no coincide y esa captura no está en el artefacto de la ${corrida}`;
    case "sin-artefacto":
      return `el hash no coincide y no hay con qué comparar: ${r.detalle || `sin artefacto de la ${corrida} (caducado o borrado)`}`;
    default:
      return "el hash no coincide";
  }
}

/** Lee el fichero; `null` si no existe. Un JSON roto SÍ es un error: callarlo sería aprobar. */
export async function leerAprobacion(raiz = ".") {
  const f = path.join(raiz, RUTA_APROBACION);
  let texto;
  try {
    texto = await readFile(f, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(texto);
  } catch (err) {
    throw new Error(`${RUTA_APROBACION} no es JSON válido: ${err.message}`);
  }
}
