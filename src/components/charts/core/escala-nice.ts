/**
 * La escala «nice» de los ejes: elige el PASO y el dominio, y garantiza que el rótulo que se
 * pinta represente exactamente el valor de su tick.
 *
 * Esto último es la razón de existir del módulo. `niceDomain` elegía el paso con la familia
 * clásica {1, 2, 5}, y para un rango de 0 a 2,25 M acababa con ticks en múltiplos de 0,45 M:
 * `formatAxisCompact(2_250_000)` los redondea a **«₡2,3M»**, así que el eje afirmaba 2,3 M
 * donde la línea valía 2,25 M. Un eje que miente por 50.000 no es un detalle de formato:
 * es el eje contra el que alguien lee su patrimonio.
 *
 * Dos decisiones:
 *
 * 1. **El paso sale de {1, 2, 2,5, 5} × 10ᵏ.** El 2,5 entra porque `formatAxisCompact` da un
 *    decimal, así que «₡2,5M» es exacto y evita saltar de 2 a 5 (que deja el gráfico a media
 *    altura). El 3 y el 4 NO entran: nadie lee un eje de 3 en 3.
 * 2. **El paso elegido se COMPRUEBA contra el formateador.** Restringir la familia no basta:
 *    con paso 250.000 el tick 1.250.000 cruza a la unidad «M» y sale «₡1,3M». Se descartan
 *    los pasos cuyos rótulos no reconstruyen su tick, y entre los que quedan gana el que
 *    menos aire deja. Si ninguno pasa —no debería—, gana el más ajustado: un eje con 4-6
 *    ticks redondos sigue siendo mejor que ninguno.
 */
import { formatAxisCompact } from "@/lib/format";

/** Mantisas admitidas para el paso. */
const MANTISAS = [1, 2, 2.5, 5] as const;

export type OpcionesEscala = {
  /** Fuerza el 0 dentro del dominio (montos acumulados, barras). */
  desdeCero?: boolean;
  /** Rango de divisiones aceptable. Por defecto 4-6. */
  minTicks?: number;
  maxTicks?: number;
  /** Moneda con la que se comprueba la fidelidad del rótulo. */
  moneda?: string;
};

export type Escala = {
  dominio: [number, number];
  paso: number;
  ticks: number[];
};

/** Todos los pasos candidatos que podrían cubrir `span` con un número razonable de ticks. */
function candidatos(span: number): number[] {
  if (!(span > 0)) return [1];
  const k0 = Math.floor(Math.log10(span)) - 2;
  const out: number[] = [];
  for (let k = k0; k <= k0 + 4; k++)
    for (const m of MANTISAS) {
      const p = m * Math.pow(10, k);
      if (p > 0 && Number.isFinite(p)) out.push(p);
    }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

/**
 * ¿El rótulo de cada tick reconstruye su valor?
 *
 * Se compara `formatAxisCompact(tick)` contra el rótulo del valor REDONDEADO como lo haría
 * el formateador. Si el redondeo mueve el valor, el rótulo del valor movido coincide con el
 * del tick y el original no: eso delata la mentira sin tener que parsear el texto.
 */
function rotulosFieles(ticks: number[], moneda: string): boolean {
  for (const t of ticks) {
    const abs = Math.abs(t);
    if (abs < 1000) continue; // por debajo de 1.000 no abrevia: siempre exacto
    const div = abs >= 1e12 ? 1e12 : abs >= 1e6 ? 1e6 : 1e3;
    const escalado = abs / div;
    const dec = Math.round(escalado * 10) % 10 === 0 ? 0 : 1;
    // El valor que el rótulo REALMENTE comunica, deshaciendo el redondeo del formateador.
    const comunicado = Math.sign(t) * Number(escalado.toFixed(dec)) * div;
    // Una diezmilésima de tolerancia por el coma flotante, no por el redondeo del rótulo.
    if (Math.abs(comunicado - t) > Math.abs(t) * 1e-9 + 1e-6) return false;
    // Y que el formateador no cambie de opinión con el valor reconstruido.
    if (formatAxisCompact(comunicado, moneda) !== formatAxisCompact(t, moneda)) return false;
  }
  return true;
}

function ticksDe(min: number, max: number, paso: number): number[] {
  const desde = Math.floor(min / paso);
  const hasta = Math.ceil(max / paso);
  const out: number[] = [];
  for (let i = desde; i <= hasta; i++) {
    // Se redondea el producto: 3 × 0,1 da 0,30000000000000004 y el rótulo lo delataría.
    const v = i * paso;
    out.push(Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(12)));
  }
  return out;
}

/**
 * Dominio, paso y ticks para un eje. `min`/`max` son los datos VISIBLES: recortar el rango
 * tiene que recalcular la escala, o el zoom no muestra nada.
 */
export function escalaNice(valores: readonly number[], opts: OpcionesEscala = {}): Escala {
  const nums = valores.filter((v) => Number.isFinite(v));
  const minTicks = opts.minTicks ?? 4;
  const maxTicks = opts.maxTicks ?? 6;
  const moneda = opts.moneda ?? "CRC";

  if (nums.length === 0) return { dominio: [0, 1], paso: 1, ticks: [0, 1] };

  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (opts.desdeCero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (min === max) {
    // Serie plana: se abre un rango alrededor del valor en vez de un eje de altura cero.
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }

  const opciones = candidatos(max - min)
    .map((paso) => {
      const ticks = ticksDe(min, max, paso);
      return { paso, ticks, dominio: [ticks[0]!, ticks.at(-1)!] as [number, number] };
    })
    .filter((o) => o.ticks.length >= minTicks && o.ticks.length <= maxTicks);

  if (opciones.length === 0) {
    // Ningún paso da 4-6 ticks (rangos degenerados): el más ajustado que exista.
    const paso = candidatos(max - min)[0] ?? 1;
    const ticks = ticksDe(min, max, paso);
    return { paso, ticks, dominio: [ticks[0]!, ticks.at(-1)!] };
  }

  // Entre las que caben, las FIELES primero; y dentro de cada grupo, la que menos aire deja.
  const aire = (o: (typeof opciones)[number]) => o.dominio[1] - o.dominio[0];
  const fieles = opciones.filter((o) => rotulosFieles(o.ticks, moneda));
  const elegibles = fieles.length > 0 ? fieles : opciones;
  return elegibles.reduce((a, b) => (aire(b) < aire(a) ? b : a));
}

/**
 * ¿El dominio incluye el cero? Es la pregunta que decide si una serie puede dibujarse como
 * ÁREA.
 *
 * El relleno de un área codifica «cuánto hay» con su superficie, y eso solo es cierto si la
 * base es el cero. Con el eje recortado a 37-41 M el relleno mide la distancia a un borde
 * inferior que no significa nada, y un mes que sube un 4 % parece duplicarse. Sin el cero
 * dentro, la serie va como línea: ahí lo que se lee es la PENDIENTE, que sigue siendo cierta
 * con el eje cortado.
 */
export function incluyeCero(dominio: readonly [number, number]): boolean {
  return dominio[0] <= 0 && dominio[1] >= 0;
}
