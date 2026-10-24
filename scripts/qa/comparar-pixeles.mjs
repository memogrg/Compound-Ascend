/**
 * El conteo de píxeles distintos entre dos capturas. Puro: recibe dos mapas de bytes RGBA y
 * devuelve números.
 *
 * Vive aparte de `diff.mjs` para poder probarlo sin abrir un navegador: `diff.mjs` lo inyecta
 * en la página —ahí es donde están los `ImageData`— y el test lo importa tal cual en Node.
 * Una sola implementación; si se copiara, el criterio del arnés y el que se prueba acabarían
 * divergiendo, que es justo lo que no puede pasar con la herramienta que decide si algo pasa.
 */

/**
 * @param {Uint8ClampedArray|number[]} a  bytes RGBA de la captura A
 * @param {Uint8ClampedArray|number[]} b  bytes RGBA de la captura B
 * @param {{ threshold?: number, ignorarDeltaBajo?: number }} opciones
 *   - `threshold`: por debajo de esta diferencia POR CANAL, el píxel es idéntico. Default 0.
 *   - `ignorarDeltaBajo`: los píxeles cuyo delta máximo por canal sea MENOR que este número
 *     no cuentan como diferencia, pero se cuentan aparte. Es el antialiasing: un borde de
 *     texto que se redibuja un nivel más claro no es una regresión, y hacerlo fallar a uno le
 *     enseña a ignorar los rojos. Se reporta el número para que el ruido no se vuelva
 *     invisible. Default 0 (no ignora nada).
 * @returns {{ diferentes: number, ignorados: number, maxDelta: number, marcas: Uint8Array }}
 *   `marcas` lleva 0 = igual, 1 = diferente, 2 = ignorado, para pintar el PNG de diferencias.
 */
export function contarDiferencias(a, b, opciones = {}) {
  const threshold = opciones.threshold ?? 0;
  const ignorarDeltaBajo = opciones.ignorarDeltaBajo ?? 0;

  const total = Math.min(a.length, b.length) >> 2;
  const marcas = new Uint8Array(total);
  let diferentes = 0;
  let ignorados = 0;
  let maxDelta = 0;

  for (let p = 0; p < total; p++) {
    const i = p << 2;
    const dr = Math.abs(a[i] - b[i]);
    const dg = Math.abs(a[i + 1] - b[i + 1]);
    const db = Math.abs(a[i + 2] - b[i + 2]);
    const da = Math.abs(a[i + 3] - b[i + 3]);

    if (!(dr > threshold || dg > threshold || db > threshold || da > threshold)) continue;

    const delta = Math.max(dr, dg, db, da);
    if (delta < ignorarDeltaBajo) {
      ignorados++;
      marcas[p] = 2;
      continue;
    }

    diferentes++;
    marcas[p] = 1;
    // `maxDelta` solo mira los píxeles que CUENTAN: si un píxel se ignora, no puede seguir
    // haciendo fallar el criterio de delta por la puerta de atrás.
    if (delta > maxDelta) maxDelta = delta;
  }

  return { diferentes, ignorados, maxDelta, marcas };
}
