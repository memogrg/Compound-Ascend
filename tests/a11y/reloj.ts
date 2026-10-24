/**
 * El instante congelado, para los specs.
 *
 * El arnés congela DOS relojes distintos y hasta ahora los specs no usaban ninguno:
 *
 *   - el del SERVIDOR, con el preload `scripts/qa/server-freeze.js` que instala `qa:start`;
 *   - el del NAVEGADOR, que `snap.mjs` fija con `page.clock.setFixedTime` en cada captura.
 *
 * Los specs abrían el navegador con el reloj REAL. Para casi todo daba igual, hasta el
 * 30-sep-2026: el catálogo de `/dev/ui` calcula sus días en el CLIENTE (`"use client"`), el
 * último día del mes no deja ningún día futuro, y `charts-calendario.spec.ts` se puso rojo con
 * «esperaba > 0 celdas `data-futuro`, recibió 0» sin que nadie tocara nada. Un check obligatorio
 * que falla una vez al mes por el calendario no es un check.
 *
 * La regla, a partir de acá: **ningún spec de `tests/a11y` ni de `tests/e2e` lee el reloj real**.
 * El instante sale de `QA_INSTANTE` (el literal del workflow) o de `QA_FREEZE` (el que exporta
 * `qa:start`), y se resuelve con el MISMO helper que usa el arnés — no con una copia que pueda
 * separarse. Vive en `scripts/qa/instante.mjs` y no en `snap.mjs` porque éste usa
 * `import.meta`, y Playwright transpila los specs a CommonJS: importarlo reventaba los cuatro
 * jobs de E2E con «Cannot use 'import.meta' outside a module», sin ejecutar un solo test. Hay una guarda de unidad que lo comprueba.
 */
// @ts-expect-error — `.mjs` sin tipos: es el arnés de QA, no código de la app.
import { instanteCongelado } from "../../scripts/qa/instante.mjs";

/**
 * El instante con el que corren los specs.
 *
 * Precedencia: `QA_INSTANTE` > `QA_FREEZE` > el valor por defecto del arnés (el último mediodía
 * de Costa Rica ya ocurrido). La primera es la que fija el workflow para que la base y la rama
 * de las capturas midan el mismo día; los specs se suben a ella para no ser la única pieza del
 * arnés que mira otro calendario.
 */
export const INSTANTE: Date = instanteCongelado(
  process.env.QA_INSTANTE ?? process.env.QA_FREEZE ?? undefined,
);

/** `2026-09-18`, en la zona del producto. Para construir fechas esperadas sin `new Date()`. */
export function hoyISO(tz = "America/Costa_Rica"): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(INSTANTE);
  return p;
}

/** El año y el mes (1-12) del instante congelado, en la zona del producto. */
export function anioMes(tz = "America/Costa_Rica"): { anio: number; mes: number } {
  const [anio, mes] = hoyISO(tz).split("-").map(Number);
  return { anio: anio ?? 0, mes: mes ?? 0 };
}

/**
 * Congela el reloj del NAVEGADOR de esta página.
 *
 * `setFixedTime` y no `install`: lo que hace falta es que `new Date()` devuelva siempre el mismo
 * instante, no simular el paso del tiempo. Es exactamente lo que hace `snap.mjs` antes de cada
 * captura, y por eso las capturas sí eran reproducibles mientras los specs no.
 */
export async function congelarReloj(page: { clock: { setFixedTime(t: Date): Promise<void> } }) {
  await page.clock.setFixedTime(INSTANTE);
}
