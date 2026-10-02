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

/**
 * Una celda: texto pelado, o texto con TONO.
 *
 * El tono es el mismo canal que usa el tooltip (`data-tono`) para decir si un número es bueno o
 * malo sin depender solo del color. Se declara acá en vez de dejar que cada gráfico pinte su
 * propia tabla, que es como acabamos con dos tablas en la misma tarjeta.
 */
export type CeldaDato = string | { texto: string; tono?: "bueno" | "malo" };

/**
 * Una fila, cuando necesita más que una lista de celdas.
 *
 * `nota` es una fila extra a todo el ancho, debajo de la de datos: el mes en curso lleva un
 * mensaje que en una celda de quince caracteres se parte en cuatro renglones y duplica el alto
 * de la tabla.
 */
export type FilaTabla = {
  celdas: CeldaDato[];
  /**
   * `tono` es un `string` y no la unión de las celdas a propósito: el vocabulario NO es el mismo.
   * Una celda dice si un número es `bueno` o `malo`; la nota del mes en curso dice si el ritmo es
   * `neutro` o `alerta`, que no es lo mismo que «bueno». Forzar una sola unión obligaría a
   * traducir un concepto al otro, y esa traducción es justo la que confunde «vas ahorrando» con
   * «todavía no has gastado lo que te toca».
   */
  nota?: { texto: string; tono?: string };
};

/**
 * La tabla accesible de un gráfico.
 *
 * `filas` acepta la forma simple (`string[]`, que es lo que devuelve `tablaDeDatos` y lo que usan
 * casi todos los gráficos) **o** la rica. Es aditivo a propósito: extender el tipo no puede
 * obligar a tocar los gráficos que ya funcionan.
 */
export type TablaDatos = {
  encabezados: string[];
  filas: (string[] | FilaTabla)[];
  /** Lo que va en el `<caption>`. Si falta, el marco pone el título del gráfico. */
  titulo?: string;
};

/**
 * La forma SIMPLE, que es lo que devuelve `tablaDeDatos` y lo que consume casi todo.
 *
 * Existe para que extender `TablaDatos` con la forma rica no obligue a los que ya indexan
 * `filas[i][3]` a estrechar el tipo a mano. Es asignable a `TablaDatos`.
 */
export type TablaSimple = {
  encabezados: string[];
  filas: string[][];
  titulo?: string;
};

/** Normaliza cualquiera de las dos formas a la rica, para que el marco pinte una sola cosa. */
export function filaNormalizada(fila: string[] | FilaTabla): FilaTabla {
  return Array.isArray(fila) ? { celdas: fila } : fila;
}

/** El texto de una celda, venga como venga. */
export function textoCelda(c: CeldaDato): string {
  return typeof c === "string" ? c : c.texto;
}

/** El tono de una celda, o `undefined`. */
export function tonoCelda(c: CeldaDato): "bueno" | "malo" | undefined {
  return typeof c === "string" ? undefined : c.tono;
}

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
): TablaSimple {
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

/**
 * Lo que se anuncia por `aria-live` cuando alguien recorre el gráfico con el teclado.
 *
 *   «may 26: Real ₡1.887.000; Presupuesto ₡1.930.000»
 *
 * Punto y coma entre series porque la coma ya separa los miles dentro de cada cifra, y un
 * lector de pantalla lee «uno coma ochocientos ochenta y siete» de corrido si se mezclan.
 *
 * Solo se anuncia en TECLADO, no en hover de ratón: quien usa el ratón ya está viendo el
 * tooltip, y anunciar cada punto al pasar por encima convierte el lector en ruido continuo.
 * Esa decisión la aplica quien llama; acá solo se construye la frase.
 */
export function describirPunto(
  label: string,
  filas: readonly { etiqueta: string; valor: string }[],
): string {
  if (filas.length === 0) return label;
  return `${label}: ${filas.map((f) => `${f.etiqueta} ${f.valor}`).join("; ")}`;
}
