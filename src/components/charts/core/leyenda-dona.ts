/**
 * Las filas de la leyenda de una dona: qué parte es cada cosa, en qué orden va y qué hacer
 * con las que no caben.
 *
 * Puro y sin React a propósito. Lo que puede mentir acá son los números —un porcentaje que no
 * cuadra, un sobrante que desaparece—, y eso se prueba sin navegador.
 *
 * **Hay dos modos, y no son un ajuste de gusto: son dos preguntas distintas.**
 *
 * · `taxonomia` — bloques fijos, pocos y con significado propio: los nueve de la taxonomía de
 *   gasto, las clases de activo. Se muestran TODOS, en el orden canónico que da quien llama.
 *   El orden dice algo, y que un bloque desaparezca de la leyenda porque este mes gastó poco
 *   hace imposible comparar dos meses: el lector no sabe si bajó a cero o si se lo plegaron.
 * · `lista` — categorías de gasto, que son veinticinco y no tienen orden natural. Ahí sí
 *   manda el monto, y el resto se agrega en una fila con su nombre, su monto y su porcentaje.
 */
import { repartoMayorResto } from "./reparto";

export type DatoDona = { name: string; value: number; color: string };

export type FilaDona = DatoDona & {
  /** Entero. Todas las filas visibles juntas suman EXACTAMENTE 100. */
  pct: number;
  /** La fila es el agregado de las que no se muestran. */
  resto?: boolean;
};

export type ModoLeyenda = "taxonomia" | "lista";

/**
 * Cuántas filas se muestran en modo `lista` antes de agrupar.
 *
 * Seis y no diez: es el número de colores distinguibles que tiene la paleta de gráficos
 * (`--chart-1..6`), validada para las cuatro visiones. Mostrar una séptima obligaría a repetir
 * un color, y dos porciones del mismo color en la misma dona es peor que una fila menos.
 */
const VISIBLES = 6;

/** Color de la fila del sobrante: gris de chip, no un color de serie que sí está en la dona. */
const COLOR_RESTO = "var(--chip)";

export type ResultadoLeyenda = {
  /** Lo que se dibuja: en la dona y en la leyenda, las mismas filas y en el mismo orden. */
  filas: FilaDona[];
  /** Lo que hay dentro de «Otras N», para el desplegable. Vacío si no se agrupó nada. */
  ocultas: FilaDona[];
};

/**
 * Filas de la leyenda, con el porcentaje repartido por MAYOR RESTO.
 *
 * Redondear cada porcentaje por su cuenta no conserva el 100: tres tercios dan 33+33+33 = 99,
 * y una tarjeta cuyas partes no suman el todo se lee como un error de la app aunque los montos
 * estén bien. El reparto se hace sobre TODOS los valores de una vez, porque un reparto no se
 * puede hacer por partes.
 *
 * Una sola de sobra no se agrupa: «Otras 1» ocupa el mismo renglón que su nombre y dice menos.
 */
export function filasLeyenda(
  data: readonly DatoDona[],
  {
    modo = "taxonomia",
    visibles = VISIBLES,
    etiquetaResto = "Otras",
  }: {
    modo?: ModoLeyenda;
    visibles?: number;
    etiquetaResto?: string;
  } = {},
): ResultadoLeyenda {
  if (data.length === 0) return { filas: [], ocultas: [] };

  const pcts = repartoMayorResto(
    data.map((d) => d.value),
    100,
  );
  // Sin masa que repartir, `repartoMayorResto` pone el 100 entero en la primera parte para no
  // perderlo. Acá eso sería mentira: «esta categoría de ₡0 es el 100 %». Se ponen a cero.
  const total = data.reduce((s, d) => s + d.value, 0);
  const conPct: FilaDona[] = data.map((d, i) => ({ ...d, pct: total > 0 ? (pcts[i] ?? 0) : 0 }));

  if (modo === "taxonomia") return { filas: conPct, ocultas: [] };

  // El orden es ESTABLE: a igualdad de monto manda el orden de entrada, para que dos renders
  // con los mismos datos den exactamente lo mismo.
  const ordenadas = conPct
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f.value - a.f.value || a.i - b.i)
    .map(({ f }) => f);

  const sobran = ordenadas.length - visibles;
  if (sobran < 2) return { filas: ordenadas, ocultas: [] };

  const filas = ordenadas.slice(0, visibles);
  const ocultas = ordenadas.slice(visibles);
  return {
    filas: [
      ...filas,
      {
        name: `${etiquetaResto} ${ocultas.length}`,
        value: ocultas.reduce((s, f) => s + f.value, 0),
        color: COLOR_RESTO,
        // El porcentaje del sobrante es LO QUE FALTA para 100, no la suma de sus porcentajes:
        // así la columna sigue sumando 100 exacto aunque el reparto haya movido unidades.
        pct: 100 - filas.reduce((s, f) => s + f.pct, 0),
        resto: true,
      },
    ],
    ocultas,
  };
}
