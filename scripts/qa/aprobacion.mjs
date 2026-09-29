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
 *      exacto. Si la pantalla vuelve a cambiar, el hash deja de coincidir y la aprobación caduca
 *      sola: no hay forma de aprobar `/configuracion` «en general».
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
 * Devuelve las tres listas que importan, y NINGUNA de las tres es un detalle:
 *   - `aprobadas`: reprobadas cuya aprobación coincide en hash. Salen del veredicto.
 *   - `sinAprobar`: reprobadas que nadie aprobó. Hacen fallar.
 *   - `caducadas`: aprobaciones cuyo hash ya no coincide, o que sobran porque esa captura ya no
 *     se reprueba. También hacen fallar: una aprobación que no se corresponde con nada es una
 *     que alguien copió de otro PR, y dejarla pasar en silencio vacía el mecanismo entero.
 */
export function cotejar({ reprobadas, aprobacion, hashes, pr }) {
  if (!aprobacion) return { aprobadas: [], sinAprobar: reprobadas, caducadas: [], prOk: true };
  const prOk = Number(aprobacion.pr) === Number(pr);
  const porImagen = new Map((aprobacion.capturas ?? []).map((e) => [imagenDeEntrada(e), e]));

  const aprobadas = [];
  const sinAprobar = [];
  for (const img of reprobadas) {
    const e = porImagen.get(img);
    if (prOk && e && e.sha256_despues === hashes.get(img)) aprobadas.push(img);
    else sinAprobar.push(img);
  }

  const reprobadasSet = new Set(reprobadas);
  const caducadas = [];
  for (const [img, e] of porImagen) {
    if (!reprobadasSet.has(img)) caducadas.push({ imagen: img, motivo: "ya no se reprueba" });
    else if (e.sha256_despues !== hashes.get(img))
      caducadas.push({ imagen: img, motivo: "el hash no coincide" });
  }
  return { aprobadas, sinAprobar, caducadas, prOk };
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
