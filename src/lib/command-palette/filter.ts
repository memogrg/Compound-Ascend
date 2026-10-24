/**
 * El filtro de la paleta. Puro y sin dependencias: es lo que decide qué ve la persona
 * mientras escribe, así que conviene poder probarlo sin montar nada.
 */
import type { ItemPaleta } from "@/lib/command-palette/items";

/**
 * Minúsculas, sin diacríticos y recortada.
 *
 * NFD separa la letra de su tilde y el rango `̀-ͯ` borra las marcas combinantes:
 * así «Inversión» y «inversion» son la misma consulta. Sin esto, quien no escribe tildes
 * —que es casi todo el mundo cuando teclea rápido— no encontraría nada.
 */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Puntuación: lo que EMPIEZA por lo escrito vale más que lo que apenas lo contiene, y la
 * etiqueta vale más que un sinónimo. Escribir "deu" tiene que traer «Deudas» primero, no un
 * item que solo menciona deuda en sus palabras.
 */
function puntuar(item: ItemPaleta, q: string): number {
  const etiqueta = normalizar(item.etiqueta);
  if (etiqueta.startsWith(q)) return 3;
  const palabras = item.palabras.map(normalizar);
  if (palabras.some((p) => p.startsWith(q))) return 2;
  if (etiqueta.includes(q)) return 1;
  if (palabras.some((p) => p.includes(q))) return 1;
  return 0;
}

/**
 * Items que casan con `consulta`, mejor primero y como máximo `max`.
 *
 * Consulta vacía ⇒ todos, en orden de definición (acciones, luego núcleos): es el menú
 * completo al abrir, no un estado vacío.
 */
export function filtrar(items: ItemPaleta[], consulta: string, max = 12): ItemPaleta[] {
  const q = normalizar(consulta);
  // Sin consulta se devuelven TODOS, sin recortar: al abrir, la paleta es el menú completo
  // y el `max` solo existe para que una búsqueda no devuelva una lista interminable.
  if (!q) return items;

  // El índice entra en la tupla para desempatar por orden de definición: `Array.sort` no
  // garantiza estabilidad entre motores, y sin esto el orden de dos items con la misma
  // puntuación podría cambiar entre navegadores.
  const porPuntuacion = items
    .map((item, i) => ({ item, i, p: puntuar(item, q) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, max)
    .map((x) => x.item);

  return agrupar(porPuntuacion);
}

/**
 * Reagrupa sin reordenar dentro del grupo: cada grupo aparece UNA vez, en la posición que
 * le da su mejor resultado.
 *
 * Hace falta porque la lista lleva encabezados de grupo y la puntuación los intercala:
 * escribir «a» daba «Hoy → Configuración → Acciones → Hoy → Planes → … → Acciones», que se
 * lee como una lista rota. Agrupar en el filtro y no al pintar es deliberado: la vista
 * recorre el array plano para las flechas y el `aria-activedescendant`, así que el orden
 * que se ve y el que navega el teclado tienen que ser el mismo array.
 *
 * El corte por `max` ocurre ANTES: primero se eligen los mejores, después se acomodan.
 */
function agrupar(items: ItemPaleta[]): ItemPaleta[] {
  const porGrupo = new Map<string, ItemPaleta[]>();
  for (const item of items) {
    const bloque = porGrupo.get(item.grupo);
    if (bloque) bloque.push(item);
    else porGrupo.set(item.grupo, [item]);
  }
  // `Map` conserva el orden de inserción: el primer grupo es el del mejor resultado.
  return [...porGrupo.values()].flat();
}
