#!/usr/bin/env node
/**
 * El lado LECTOR de las banderas de compilación: parsear la cabecera y comparar dos capturas.
 *
 * La escritura vive en `src/lib/qa/banderas.ts` (la usa `next.config.ts`), y la lectura tiene
 * que estar en `.mjs` porque la usan `snap.mjs` y `diff.mjs`. Son dos mitades en dos lenguajes:
 * el caso de ida y vuelta de `tests/unit/qa-banderas.test.ts` es lo que impide que se separen.
 *
 * Formato: `NAV_V2=1`, varias separadas por `; `, y `(ninguna)` cuando no había ninguna.
 */

/**
 * Cómo se llama la cabecera. Espejo de `CABECERA_BANDERAS` en `src/lib/qa/banderas.ts`: el
 * nombre está en los dos lados porque uno es `.ts` y el otro `.mjs`, y el caso «el nombre de la
 * cabecera es el mismo en las dos mitades» de `tests/unit/qa-banderas.test.ts` lo vigila.
 */
export const CABECERA_BANDERAS = "x-cartera-banderas";

/** Lo que dice la cabecera cuando no había ninguna encendida (espejo de `SIN_BANDERAS`). */
export const SIN_BANDERAS = "(ninguna)";

/**
 * @param {string|null|undefined} cabecera
 * @returns {Record<string,string>} Las banderas, sin prefijo. `{}` para «ninguna».
 */
export function parsearCabecera(cabecera) {
  if (!cabecera || cabecera === SIN_BANDERAS) return {};
  /** @type {Record<string,string>} */
  const salida = {};
  for (const parte of String(cabecera).split(";")) {
    const t = parte.trim();
    if (!t) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    salida[t.slice(0, i)] = t.slice(i + 1);
  }
  return salida;
}

/**
 * Las banderas en las que dos capturas NO coinciden, con los dos valores.
 *
 * `null` en cualquiera de las dos significa «no lo sé» —un manifiesto anterior a esta guarda—
 * y devuelve `[]` a propósito: una captura vieja merece un aviso, no un bloqueo. Quien llama
 * distingue los dos casos.
 *
 * @param {string|null|undefined} base
 * @param {string|null|undefined} nueva
 * @returns {{bandera:string, base:string, nueva:string}[]}
 */
export function diferenciasDeBanderas(base, nueva) {
  if (base == null || nueva == null) return [];
  const a = parsearCabecera(base);
  const b = parsearCabecera(nueva);
  const nombres = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const difs = [];
  for (const n of nombres) {
    const va = a[n] ?? "ausente";
    const vb = b[n] ?? "ausente";
    if (va !== vb) difs.push({ bandera: n, base: va, nueva: vb });
  }
  return difs;
}
