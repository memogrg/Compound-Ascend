/**
 * Las cuentas del «Histórico de gastos» en columnas. Puras, sin React y sin Recharts.
 *
 * Están fuera del componente porque son lo que puede mentir en silencio: un % de ejecución
 * dividido por cero, una diferencia con el signo al revés, una marca de presupuesto más
 * ancha que su banda. Los píxeles los vigila el spec del navegador; los números, esto.
 */
import { formatMoney } from "@/lib/format";

import { estaEnCurso, esTramoParcial, type PeriodoEnCurso } from "./periodo-en-curso";

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

/** Cómo se parte la columna: lo que cupo en el presupuesto y lo que se pasó. */
export type PartesColumna = { dentro: number; exceso: number };

/**
 * La columna en dos tramos.
 *
 * El apilado no es decoración: una columna de un solo color obliga a comparar su altura
 * contra la marca, y eso es una medida que el ojo hace mal. Partida, el exceso ES un
 * rectángulo con su propia altura — se ve cuánto sin medir nada.
 *
 * Sin presupuesto, todo es exceso: no hay nada «dentro» de lo que no existe. Es coherente
 * con `porcentajeEjecucion`, que ahí devuelve `null` en vez de inventar un denominador.
 */
export function partesColumna(real: number, presupuesto: number): PartesColumna {
  const dentro = Math.max(0, Math.min(real, Math.max(0, presupuesto)));
  return { dentro, exceso: Math.max(0, real - dentro) };
}

/** Lo que se dice del mes a medias, y en qué tono. */
export type MensajeEnCurso = { texto: string; tono: "neutro" | "alerta" };

/**
 * Qué decir de un mes que todavía no cerró.
 *
 * La diferencia con signo NO sirve acá, y menos en verde. A mitad de mes, «−₡559.067» se lee
 * como «vas ahorrando» cuando lo cierto es «todavía no has gastado lo que te toca»: es una
 * cifra que se va a evaporar sola los días que faltan. Lo que sí es accionable es cuánto
 * queda y para cuántos días, que es lo que decide si hoy se puede salir a cenar.
 *
 * Los días salen del periodo del SERVIDOR (`userToday`, en la zona del perfil). Este módulo
 * no consulta ningún reloj: si lo hiciera, la captura con el reloj congelado mostraría los
 * días reales.
 */
export function mensajeEnCurso(
  real: number,
  presupuesto: number,
  enCurso: PeriodoEnCurso | null | undefined,
  moneda = "CRC",
): MensajeEnCurso | null {
  if (!estaEnCurso(enCurso)) return null;
  const dias = enCurso.diasDelMes - enCurso.dia;
  const restante = presupuesto - real;
  if (restante < 0) {
    return {
      texto: `Excedido por ${formatMoney(-restante, moneda)} con ${dias} días por delante`,
      tono: "alerta",
    };
  }
  // El ritmo va REDONDEADO al entero: un «₡46.588,92/día» promete una precisión que una
  // proyección a doce días no tiene.
  const porDia = Math.round(restante / dias);
  return {
    texto: `Te quedan ${formatMoney(restante, moneda)} para ${dias} días (≈ ${formatMoney(porDia, moneda)}/día)`,
    tono: "neutro",
  };
}
