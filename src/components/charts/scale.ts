/**
 * Utilidades de escala "nice" para los ejes de las gráficas (solo presentación
 * visual — no toca cálculos financieros). Redondea los límites del eje a
 * valores redondos, con padding, y maneja series negativas y planas.
 *
 * El PASO lo elige `escalaNice` (core), no esta función: ahí está la familia
 * {1, 2, 2,5, 5} × 10ᵏ y la comprobación de que el rótulo no miente sobre su tick. Esta capa
 * se queda con lo que era suyo —`symmetric`, `paddingRatio`, el caso de serie plana— y
 * delega el resto, para que los tres wrappers viejos (`area-chart`, `line-chart`,
 * `donut-chart`) hereden el arreglo sin tocarlos uno por uno.
 */
import { escalaNice } from "./core/escala-nice";

/**
 * Dominio [min, max] redondeado para un eje. Opciones:
 * - `symmetric`: si hay negativos, centra en 0 (útil para flujo ±).
 * - `zeroBased`: fuerza a incluir el 0 (montos acumulados, %).
 * - `ticks`: nº aproximado de divisiones (para calcular el paso).
 * - `paddingRatio`: expande el rango una fracción del span antes de redondear, para que la
 *   línea no toque los bordes (útil en charts chicos). Default 0.
 */
export function niceDomain(
  values: number[],
  opts: {
    symmetric?: boolean;
    zeroBased?: boolean;
    ticks?: number;
    paddingRatio?: number;
  } = {},
): [number, number] {
  return niceEscala(values, opts).dominio;
}

/**
 * La escala COMPLETA —dominio Y ticks—, con las mismas opciones que `niceDomain`.
 *
 * Existe porque devolver solo el dominio NO basta: Recharts elige entonces sus propios ticks
 * dentro de él (cinco a partes iguales), y esos caen donde caigan. En `/gastos` el dominio
 * [1 M, 3,5 M] dejaba un tick en 2,25 M que `formatAxisCompact` rotula «₡2,3M» — justo el
 * defecto que este cambio venía a arreglar, escapándose por la puerta de atrás. Quien pinte
 * un eje tiene que pasar los DOS.
 */
export function niceEscala(
  values: number[],
  opts: {
    symmetric?: boolean;
    zeroBased?: boolean;
    ticks?: number;
    paddingRatio?: number;
  } = {},
): { dominio: [number, number]; ticks: number[] } {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return { dominio: [0, 1], ticks: [0, 1] };

  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (opts.zeroBased) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (opts.paddingRatio && opts.paddingRatio > 0) {
    const span = max - min || Math.abs(max) || 1;
    const pad = span * opts.paddingRatio;
    min -= pad;
    max += pad;
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

  // `ticks` era un número APROXIMADO de divisiones; `escalaNice` trabaja con un rango, así
  // que se le da una ventana alrededor del valor pedido en vez de un número exacto.
  const pedidos = Math.max(2, opts.ticks ?? 4);
  const e = escalaNice([min, max], {
    minTicks: Math.max(2, pedidos - 1),
    maxTicks: pedidos + 2,
  });
  return { dominio: e.dominio, ticks: e.ticks };
}
