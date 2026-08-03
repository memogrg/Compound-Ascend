/**
 * RESOLUCIÓN DE UN SOBRE MENCIONADO en lenguaje natural contra los sobres REALES del usuario.
 *
 * Puro y sin IO a propósito: la lista se la pasa el llamador (el servicio la trae de
 * `listSobresForKind`, la MISMA fuente que alimenta el selector del chat, así que incluye los
 * sobres de fábrica Y los que el usuario creó). Nada hardcodeado por nombre: "Padel" o "Corte
 * Pelo David" se resuelven igual que "Restaurantes".
 *
 * Por qué importa acertar o abstenerse: si el término no resuelve, la consulta NO debe caer en
 * "sin filtro" — eso devuelve TODAS las categorías y contesta otra cosa de la que se preguntó.
 * Se prefiere decir "no encontré ese sobre" antes que traer todo.
 */

export type SobreRef = { id: string; sobre: string; frasco: string | null };

export type SobreMatch =
  | { estado: "resuelto"; sobre: SobreRef }
  /** Varios sobres compiten con la misma fuerza: hay que preguntar cuál. */
  | { estado: "ambiguo"; candidatos: SobreRef[] }
  | { estado: "sin_match" };

/** Ruta legible "Frasco › Sobre" (o solo el sobre si no cuelga de un frasco). */
export function rutaSobre(s: SobreRef): string {
  return s.frasco ? `${s.frasco} › ${s.sobre}` : s.sobre;
}

/** minúsculas, sin acentos, sin puntuación, espacios colapsados. */
export function normalizarSobre(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Raíz para comparar singular/plural y abreviaturas de uso corriente.
 * "supermercados" → "supermercado"; "restaurantes" → "restaurante". Se aplica por PALABRA para
 * que funcione en nombres compuestos ("compras casa" ↔ "compra casa").
 */
function raiz(palabra: string): string {
  if (palabra.length <= 3) return palabra;
  if (palabra.endsWith("es")) return palabra.slice(0, -2);
  if (palabra.endsWith("s")) return palabra.slice(0, -1);
  return palabra;
}

const raices = (s: string): string => normalizarSobre(s).split(" ").map(raiz).join(" ");

/** Palabras significativas de un texto ya normalizado (descarta conectores). */
const STOP = new Set(["de", "del", "la", "el", "los", "las", "y", "en", "para", "por", "a", "mi", "mis"]);
const tokens = (s: string): string[] =>
  raices(s)
    .split(" ")
    .filter((w) => w && !STOP.has(w));

/**
 * ¿Cuántos tokens comparten? Es el "fuzzy" del último escalón: alcanza para que "corte pelo"
 * encuentre "Corte Pelo David" sin abrir la puerta a coincidencias por una sola letra.
 */
function solapamiento(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((w) => setB.has(w)).length;
}

/**
 * Resuelve `termino` contra `sobres` en tres escalones, de más a menos estricto. Se toma el
 * PRIMER escalón que produzca resultados: si hay un match exacto, un "contiene" más flojo no
 * puede volverlo ambiguo.
 *
 * 1. EXACTO sobre la raíz (singular/plural incluidos), en el nombre del sobre o en su ruta.
 * 2. CONTIENE: la raíz del término aparece dentro del nombre, o el nombre dentro del término.
 * 3. SOLAPAMIENTO de palabras significativas (≥1), ordenado por cuántas comparten.
 *
 * Empate en el mismo escalón → "ambiguo": preguntar cuál es mejor que elegir por el orden de
 * la lista.
 */
export function matchSobre(termino: string, sobres: SobreRef[]): SobreMatch {
  const t = normalizarSobre(termino);
  if (!t || sobres.length === 0) return { estado: "sin_match" };
  const tr = raices(t);
  const tt = tokens(t);

  const exactos = sobres.filter((s) => raices(s.sobre) === tr || raices(rutaSobre(s)) === tr);
  if (exactos.length) return decidir(exactos);

  const contiene = sobres.filter((s) => {
    const n = raices(s.sobre);
    return n.includes(tr) || tr.includes(n);
  });
  if (contiene.length) return decidir(contiene);

  if (tt.length === 0) return { estado: "sin_match" };
  const porSolape = sobres
    .map((s) => ({ s, n: solapamiento(tt, tokens(rutaSobre(s))) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (porSolape.length === 0) return { estado: "sin_match" };
  // Solo compiten los del máximo solapamiento; los de menos quedan descartados, no ambiguos.
  const mejor = porSolape[0]!.n;
  return decidir(porSolape.filter((x) => x.n === mejor).map((x) => x.s));
}

function decidir(candidatos: SobreRef[]): SobreMatch {
  if (candidatos.length === 1) return { estado: "resuelto", sobre: candidatos[0]! };
  return { estado: "ambiguo", candidatos };
}
