/**
 * Utilidades de escala "nice" para los ejes de las gráficas (solo presentación
 * visual — no toca cálculos financieros). Redondea los límites del eje a
 * valores redondos, con padding, y maneja series negativas y planas.
 */

/** Redondea a un "nice number" (1, 2, 5 × 10ⁿ). */
function niceNum(x: number, round: boolean): number {
  if (x === 0) return 0;
  const exp = Math.floor(Math.log10(Math.abs(x)));
  const frac = Math.abs(x) / Math.pow(10, exp);
  let nice: number;
  if (round) {
    nice = frac < 1.5 ? 1 : frac < 3 ? 2 : frac < 7 ? 5 : 10;
  } else {
    nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  }
  return nice * Math.pow(10, exp) * Math.sign(x);
}

/**
 * Dominio [min, max] redondeado para un eje. Opciones:
 * - `symmetric`: si hay negativos, centra en 0 (útil para flujo ±).
 * - `zeroBased`: fuerza a incluir el 0 (montos acumulados, %).
 * - `ticks`: nº aproximado de divisiones (para calcular el paso).
 */
export function niceDomain(
  values: number[],
  opts: { symmetric?: boolean; zeroBased?: boolean; ticks?: number } = {},
): [number, number] {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return [0, 1];

  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (opts.zeroBased) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    // Serie plana: abre un rango simétrico alrededor del valor.
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  if (opts.symmetric && min < 0) {
    const m = Math.max(Math.abs(min), Math.abs(max));
    min = -m;
    max = m;
  }

  const ticks = Math.max(2, opts.ticks ?? 4);
  const step = niceNum(niceNum(max - min, false) / (ticks - 1), true) || 1;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  return [niceMin, niceMax];
}
