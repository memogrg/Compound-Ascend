/**
 * Un tramo que todavía no terminó no se dibuja como uno cerrado.
 *
 * El último punto de una serie mensual es, casi siempre, un mes A MEDIAS. Pintarlo igual que
 * los anteriores dice «este mes gastaste esto», cuando lo cierto es «esto llevás». El día 18
 * de un mes de 30 la cifra está al 60 % de su recorrido y el gráfico la muestra cayendo — lo
 * que se lee es una mejora que no ocurrió.
 *
 * Aquí viven las tres piezas puras de esa distinción: el rótulo, quién es parcial, y cómo se
 * parte la serie para que el último tramo pueda ir punteado. El dibujo lo hace el gráfico.
 */

/** Dónde está el mes: el día de hoy y cuántos tiene. Ambos en la zona del PERFIL. */
export type PeriodoEnCurso = { dia: number; diasDelMes: number };

/** `true` si el periodo existe y de verdad está a medias. */
export function estaEnCurso(p: PeriodoEnCurso | null | undefined): p is PeriodoEnCurso {
  if (!p) return false;
  const { dia, diasDelMes } = p;
  if (!Number.isInteger(dia) || !Number.isInteger(diasDelMes)) return false;
  if (diasDelMes < 1 || dia < 1 || dia > diasDelMes) return false;
  // El último día del mes es un mes COMPLETO: rotularlo «en curso» diría que falta algo.
  return dia < diasDelMes;
}

/** «en curso · día 18 de 30». `null` cuando el periodo no está a medias. */
export function rotuloEnCurso(p: PeriodoEnCurso | null | undefined): string | null {
  return estaEnCurso(p) ? `en curso · día ${p.dia} de ${p.diasDelMes}` : null;
}

/** ¿El punto `indice` de una serie de `total` puntos es el tramo a medias? */
export function esTramoParcial(
  indice: number,
  total: number,
  p: PeriodoEnCurso | null | undefined,
): boolean {
  return estaEnCurso(p) && total > 0 && indice === total - 1;
}

/**
 * Parte la serie en dos para poder pintar el último tramo distinto.
 *
 * Recharts no sabe dibujar media línea punteada, así que se dibujan DOS: una con la parte
 * cerrada y otra con el último tramo. Las dos comparten el punto de unión —el penúltimo— o
 * quedaría un hueco entre ambas; el resto va en `null`, que `connectNulls={false}` no une.
 *
 * `clave` es el campo del valor, para no atarse a un nombre.
 */
export function partirSerieEnCurso<T extends Record<string, unknown>>(
  serie: readonly T[],
  p: PeriodoEnCurso | null | undefined,
  clave: keyof T & string,
): { cerrada: T[]; enCurso: T[] } {
  // Con un solo punto no hay tramo que partir: un segmento necesita dos extremos.
  if (!estaEnCurso(p) || serie.length < 2) return { cerrada: [...serie], enCurso: [] };

  const ultimo = serie.length - 1;
  const cerrada = serie.map((punto, i) =>
    i === ultimo ? ({ ...punto, [clave]: null } as T) : ({ ...punto } as T),
  );
  const enCurso = serie.map((punto, i) =>
    i >= ultimo - 1 ? ({ ...punto } as T) : ({ ...punto, [clave]: null } as T),
  );
  return { cerrada, enCurso };
}
