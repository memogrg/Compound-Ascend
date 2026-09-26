/**
 * Las cuentas del «Histórico de gastos» en columnas. Puras, sin React y sin Recharts.
 *
 * Están fuera del componente porque son lo que puede mentir en silencio: un % de ejecución
 * dividido por cero, una diferencia con el signo al revés, una marca de presupuesto más
 * ancha que su banda. Los píxeles los vigila el spec del navegador; los números, esto.
 */
import { esTramoParcial, type PeriodoEnCurso } from "./periodo-en-curso";

/** Un mes del histórico: lo que se gastó, lo que se había presupuestado, y si va a medias. */
export type FilaHistorico = {
  label: string;
  real: number;
  presupuesto: number;
  /** El mes todavía no cerró: la columna va lavada y con contorno punteado. */
  parcial: boolean;
};

export type PuntoHistorico = {
  label: string;
  real: number;
  presupuesto: number;
};

/**
 * % de ejecución del presupuesto, redondeado al entero.
 *
 * `null` cuando no hay presupuesto, y eso importa: gastar ₡300.000 sin presupuesto no es
 * «0 % de ejecución» —que se lee como «no gastaste nada»— sino una pregunta sin denominador.
 * Un `Infinity` tampoco sirve: el formateador lo pinta como «∞ %» y nadie sabe qué hacer con eso.
 */
export function porcentajeEjecucion(real: number, presupuesto: number): number | null {
  if (!(presupuesto > 0)) return null;
  return Math.round((real / presupuesto) * 100);
}

/**
 * Gasto menos presupuesto. **Negativa cuando sobró.**
 *
 * El orden no es arbitrario: el signo tiene que coincidir con el sentido del gasto, donde
 * subir es malo. Así un número negativo se puede pintar en positivo (`--pos`) sin invertir
 * nada en el sitio donde se dibuja.
 */
export function diferencia(real: number, presupuesto: number): number {
  return real - presupuesto;
}

/** Cuánto sobresale la marca de presupuesto por CADA lado de la columna. */
const VUELO_MARCA = 3;

/**
 * Ancho de la marca de presupuesto: la columna más un poco, sin salirse de su banda.
 *
 * Sobresale para que se lea como una referencia y no como el techo de la barra. Y se recorta
 * a la banda porque si la marca de un mes invade la del vecino el ojo une las dos y lee una
 * línea continua — justo lo que el escalón mensual venía a evitar.
 */
export function anchoMarca(anchoColumna: number, banda: number): number {
  if (!(anchoColumna > 0)) return 0;
  const deseado = anchoColumna + VUELO_MARCA * 2;
  return banda > 0 ? Math.min(deseado, banda) : deseado;
}

/** Grosor de la marca, en px. Fija: 2 px se lee a cualquier escala y 1 se pierde en HiDPI. */
export const GROSOR_MARCA = 2;

/** Las filas del gráfico, con el último mes marcado como parcial si de verdad lo es. */
export function filasHistorico(
  datos: readonly PuntoHistorico[],
  enCurso: PeriodoEnCurso | null | undefined,
): FilaHistorico[] {
  return datos.map((d, i) => ({
    label: d.label,
    real: d.real,
    presupuesto: d.presupuesto,
    parcial: esTramoParcial(i, datos.length, enCurso),
  }));
}
