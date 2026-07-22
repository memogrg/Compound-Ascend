/**
 * Utilidades del RANKING de respuestas (puras, sin IO, sin server-only → importables
 * en cliente, motor y capa de IA). Varias preguntas del wizard pasaron de UNA respuesta
 * a hasta 3 CON ORDEN de prioridad (primera = primaria). El orden ES la jerarquía.
 */

/** Peso de cada rango para ponderar el arquetipo: primaria ×1, secundaria ×0.6, terciaria ×0.3.
 *  La primaria pesa igual que antes → un perfil con solo-primaria (tras la migración) da el
 *  MISMO arquetipo que cuando la respuesta era única. Cero regresión. */
export const RANK_WEIGHTS = [1, 0.6, 0.3] as const;

/** Tope de respuestas rankeadas por pregunta. */
export const RANK_MAX = 3;

/** Primera respuesta (primaria) de un campo que puede ser array, string o vacío. */
export function primaryOf<T extends string>(v: readonly T[] | T | undefined | null): T | undefined {
  if (Array.isArray(v)) return v[0];
  return (v as T | undefined) ?? undefined;
}

/** Normaliza cualquier valor (jsonb unknown, string legacy, array) a string[] de ranking. */
export function asRanked(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return typeof v === "string" && v.length > 0 ? [v] : [];
}

/**
 * Serializa un ranking para la IA: "primaria: X · secundaria: Y · terciaria: Z". Con un
 * solo valor devuelve ese valor pelado (sin la etiqueta "primaria", que solo aporta con ≥2).
 * `humanize` transforma cada valor (p. ej. reemplazar "_" por espacio). "" si vacío.
 */
export function formatRanking(values: string[], humanize: (v: string) => string = (x) => x): string {
  const clean = values.slice(0, RANK_MAX);
  if (clean.length === 0) return "";
  if (clean.length === 1) return humanize(clean[0]!);
  const labels = ["primaria", "secundaria", "terciaria"];
  return clean.map((v, i) => `${labels[i]}: ${humanize(v)}`).join(" · ");
}

/** humanize por defecto para claves con guion bajo ("menos_estres" → "menos estres"). */
export const deUnderscore = (v: string): string => v.replaceAll("_", " ");
