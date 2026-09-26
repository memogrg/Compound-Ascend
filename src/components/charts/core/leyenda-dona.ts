/**
 * Las filas de la leyenda de una dona: qué parte es cada categoría, y qué hacer con las que
 * no caben.
 *
 * Puro y sin React a propósito. Lo que puede mentir acá son los números —un porcentaje que
 * no cuadra, un sobrante que desaparece—, y eso se prueba sin navegador.
 */
import { repartoMayorResto } from "./reparto";

export type DatoDona = { name: string; value: number; color: string };

export type FilaDona = DatoDona & {
  /** Entero. Todas las filas juntas suman EXACTAMENTE 100. */
  pct: number;
  /** La fila es el agregado de las que no se muestran. */
  resto?: boolean;
};

/** Color de la fila del sobrante: gris de chip, no un color de serie que no existe en la dona. */
const COLOR_RESTO = "var(--chip)";

/**
 * Filas de la leyenda, con el porcentaje repartido por MAYOR RESTO.
 *
 * Redondear cada porcentaje por su cuenta no conserva el 100: tres tercios dan 33+33+33 = 99,
 * y una tarjeta cuyas partes no suman el todo se lee como un error de la app aunque los
 * montos estén bien. El reparto se hace sobre TODOS los valores de una vez, porque un reparto
 * no se puede hacer por partes.
 *
 * Con `maxFilas`, las que sobran se agrupan en una fila «Otras N» con su monto y su
 * porcentaje. Sin esa fila, los cinco porcentajes visibles de veinte categorías suman 40 % y
 * el lector no sabe dónde está el otro 60. **El porcentaje de cada fila visible sigue siendo
 * sobre el TOTAL**, no sobre lo mostrado: eso es lo que hace comparable la leyenda recortada
 * del panel con la completa de Gastos.
 *
 * Una sola de sobra no se agrupa: «Otras 1» ocupa el mismo renglón que su nombre y dice menos.
 */
export function filasLeyenda(
  data: readonly DatoDona[],
  { maxFilas, etiquetaResto = "Otras" }: { maxFilas?: number; etiquetaResto?: string } = {},
): FilaDona[] {
  if (data.length === 0) return [];

  const pcts = repartoMayorResto(
    data.map((d) => d.value),
    100,
  );
  // Sin masa que repartir, `repartoMayorResto` pone el 100 entero en la primera parte para no
  // perderlo. Acá eso sería mentira: «esta categoría de ₡0 es el 100 %». Se ponen a cero.
  const total = data.reduce((s, d) => s + d.value, 0);
  const conPct: FilaDona[] = data.map((d, i) => ({ ...d, pct: total > 0 ? (pcts[i] ?? 0) : 0 }));

  const sobran = maxFilas === undefined ? 0 : conPct.length - maxFilas;
  if (sobran < 2) return conPct;

  const visibles = conPct.slice(0, maxFilas);
  const agrupadas = conPct.slice(maxFilas);
  return [
    ...visibles,
    {
      name: `${etiquetaResto} ${agrupadas.length}`,
      value: agrupadas.reduce((s, f) => s + f.value, 0),
      color: COLOR_RESTO,
      // El porcentaje del sobrante es LO QUE FALTA para 100, no la suma de sus porcentajes:
      // así la columna sigue sumando 100 exacto aunque el reparto haya movido unidades.
      pct: 100 - visibles.reduce((s, f) => s + f.pct, 0),
      resto: true,
    },
  ];
}
