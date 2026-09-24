/**
 * Los presets de rango («6M», «1A», «Todo») y el recorte de la serie. Puro.
 *
 * Chips y no solo `Brush`: el `<Brush>` de Recharts se arrastra con el ratón y no tiene
 * equivalente de teclado documentado, así que como ÚNICO camino dejaría el zoom fuera del
 * alcance de quien no usa ratón. Los chips son un `radiogroup` y se recorren con Tab y
 * flechas. El brush puede acompañar para el ajuste fino; nunca sustituirlos.
 */
export type RangoPreset = "3M" | "6M" | "1A" | "2A" | "Todo";

/** Cuántos puntos deja cada preset, asumiendo una serie MENSUAL. */
const MESES: Record<RangoPreset, number | null> = {
  "3M": 3,
  "6M": 6,
  "1A": 12,
  "2A": 24,
  Todo: null,
};

/** Lo que se lee en voz alta, que no es lo mismo que lo que cabe en el chip. */
export const NOMBRE_RANGO: Record<RangoPreset, string> = {
  "3M": "últimos 3 meses",
  "6M": "últimos 6 meses",
  "1A": "último año",
  "2A": "últimos 2 años",
  Todo: "todo el historial",
};

/**
 * Recorta una serie al preset, quedándose con la COLA — los puntos más recientes.
 *
 * Si el preset pide más puntos de los que hay, devuelve la serie entera en vez de rellenar:
 * inventar meses vacíos al principio dibujaría una caída desde cero que nunca ocurrió.
 */
export function recortar<T>(serie: readonly T[], rango: RangoPreset): T[] {
  const n = MESES[rango];
  if (n === null || serie.length <= n) return [...serie];
  return serie.slice(serie.length - n);
}

/** Los presets que tienen sentido para una serie de este largo. */
export function presetsUtiles(largo: number, todos: readonly RangoPreset[]): RangoPreset[] {
  // Un preset que no recorta nada es un botón que no hace nada: si «1A» y «Todo» muestran lo
  // mismo, sobra uno. Se conserva el primero que ya cubre toda la serie y se descartan los
  // mayores, salvo «Todo», que siempre se queda como ancla.
  const utiles: RangoPreset[] = [];
  let yaCubre = false;
  for (const r of todos) {
    const n = MESES[r];
    if (r === "Todo") continue;
    if (n !== null && n >= largo) {
      if (yaCubre) continue;
      yaCubre = true;
    }
    utiles.push(r);
  }
  if (todos.includes("Todo")) utiles.push("Todo");
  return utiles;
}
