/**
 * Lo que un gráfico le dice a quien no lo ve. Puro: sin React, sin DOM.
 *
 * El SVG de un gráfico es opaco para un lector de pantalla —es un montón de `<path>`— así
 * que el canal accesible de verdad es la TABLA, y el `aria-label` solo da el titular: de qué
 * es, qué periodo cubre y en cuánto acabó. Eso es lo que alguien quiere oír antes de decidir
 * si abre la tabla entera.
 */
import type { SerieDef } from "./theme";

/** Un punto con su etiqueta del eje X y su valor. `null` = ese día no hubo dato. */
export type PuntoDescribible = { x: string; y: number | null };

/** Fila de datos de un gráfico: la etiqueta del eje X más un valor por serie. */
export type FilaDato = { x: string } & Record<string, unknown>;

export type TablaDatos = {
  encabezados: string[];
  filas: string[][];
};

/** Lo que se escribe donde no hay número. Un guion largo, no una celda vacía. */
export const SIN_DATO = "—";

/**
 * `aria-label` del gráfico: título, rango y último valor conocido.
 *
 *   «Patrimonio neto, sep 2025 a sep 2026, último valor ₡34.145.739»
 *
 * Con un solo punto no se dice «de X a X», que suena roto: se dice el punto y su valor. Sin
 * puntos —o con todos nulos— se dice que no hay datos, en vez de inventar un cero.
 */
export function describirGrafico({
  titulo,
  serie,
  formato,
}: {
  titulo: string;
  serie: readonly PuntoDescribible[];
  formato: (valor: number) => string;
}): string {
  const conDato = serie.filter((p) => p.y !== null);
  if (serie.length === 0 || conDato.length === 0) return `${titulo}, sin datos`;

  const ultimo = conDato[conDato.length - 1]!;
  if (serie.length === 1) {
    return `${titulo}, ${serie[0]!.x}, valor ${formato(ultimo.y as number)}`;
  }

  const primera = serie[0]!.x;
  const ultima = serie[serie.length - 1]!.x;
  return `${titulo}, ${primera} a ${ultima}, último valor ${formato(ultimo.y as number)}`;
}

/**
 * Los mismos datos del gráfico, como tabla: una columna por serie, en el orden en que se
 * dibujan.
 *
 * El formateador llega como argumento y no dentro de `series` porque es del GRÁFICO, no de
 * la serie: las tres series de un mismo panel se leen con la misma moneda, y tenerlo repetido
 * invita a que una acabe con otro.
 */
export function tablaDeDatos(
  data: readonly FilaDato[],
  series: readonly SerieDef[],
  formato: (valor: number) => string,
  etiquetaX = "Periodo",
): TablaDatos {
  return {
    encabezados: [etiquetaX, ...series.map((s) => s.etiqueta)],
    filas: data.map((fila) => [
      String(fila.x),
      ...series.map((s) => {
        const v = fila[s.clave];
        return typeof v === "number" && Number.isFinite(v) ? formato(v) : SIN_DATO;
      }),
    ]),
  };
}
