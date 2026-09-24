/**
 * La aritmética del desglose. Pura, sin React: es la parte que puede estar mal en silencio.
 */

export type FilaDesglose = {
  id: string;
  etiqueta: string;
  valor: number;
  /** El color de la ENTIDAD. Nunca se deriva de la posición: ver `tests/unit/color-por-entidad`. */
  color?: string;
  hijos?: FilaDesglose[];
};

/** La fila sintética que agrupa la cola. Se reconoce por este id. */
export const ID_OTROS = "__otros__";

/**
 * Ordena por valor descendente y pliega la cola en «Otros».
 *
 * Con `max = 6` y ocho sobres quedan seis filas más «Otros» — siete en total. Se pliega
 * **desde la séptima**, no desde la sexta: reemplazar una fila real por un «Otros» que
 * contiene una sola cosa esconde su nombre sin ahorrar nada, así que si solo sobra una
 * queda tal cual.
 *
 * Los negativos se ordenan como lo que son (al final), pero no se descartan: una fila
 * negativa que desapareciera dejaría el total sin cuadrar, y eso es peor que verla.
 */
export function plegarOtros(filas: readonly FilaDesglose[], max = 6): FilaDesglose[] {
  const ordenadas = [...filas].sort((a, b) => b.valor - a.valor);
  if (ordenadas.length <= max + 1) return ordenadas;

  const visibles = ordenadas.slice(0, max);
  const cola = ordenadas.slice(max);
  return [
    ...visibles,
    {
      id: ID_OTROS,
      etiqueta: `Otros (${cola.length})`,
      valor: cola.reduce((s, f) => s + f.valor, 0),
      // Sin color propio: «Otros» no es una entidad, es el resto. Lo pinta el fallback.
      hijos: cola,
    },
  ];
}

/**
 * Porcentajes ENTEROS que suman exactamente 100, por el método del mayor resto.
 *
 * Redondear cada uno por su cuenta da 99 o 101 con una facilidad que sorprende —tres tercios
 * dan 33+33+33=99— y un desglose cuyos porcentajes no suman 100 es lo primero que alguien
 * nota y lo último que perdona.
 *
 * El reparto de los puntos sobrantes va al resto más grande; con empate exacto, al que venga
 * antes. Determinista a propósito: la misma entrada tiene que dar siempre la misma salida, o
 * las capturas de QA parpadearían.
 */
export function porcentajesExactos(valores: readonly number[], total?: number): number[] {
  const finitos = valores.map((v) => (Number.isFinite(v) ? v : 0));
  const sumaFilas = finitos.reduce((s, v) => s + v, 0);
  const base = total ?? sumaFilas;
  // Sin base no hay porcentaje: 0 es la única respuesta honesta (ni 0/0 = 100, ni NaN).
  if (!Number.isFinite(base) || base <= 0) return finitos.map(() => 0);

  const exactos = finitos.map((v) => (v / base) * 100);

  // El reparto a 100 SOLO vale si estas filas son el todo. Con un total explícito mayor
  // —un desglose parcial: 30 de un total de 100— forzar la suma a 100 convertiría un 30 %
  // en un 31 % y el número pintado sería mentira. Ahí se redondea cada uno por su cuenta y
  // la suma queda por debajo, que es justo lo que el dato dice.
  if (Math.abs(base - sumaFilas) > 1e-9) return exactos.map((x) => Math.round(x));

  const piso = exactos.map((x) => Math.floor(x));
  let faltan = 100 - piso.reduce((s, v) => s + v, 0);

  // Índices por resto descendente; el empate lo rompe el orden original.
  const porResto = exactos
    .map((x, i) => ({ i, resto: x - Math.floor(x) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);

  const salida = [...piso];
  for (const { i } of porResto) {
    if (faltan <= 0) break;
    salida[i] = (salida[i] ?? 0) + 1;
    faltan--;
  }
  return salida;
}

/* ── Estado del desglose: qué está seleccionado y en qué nivel estamos ──────────────── */

export type EstadoDesglose = {
  /** Id de la fila fijada, o null. */
  seleccion: string | null;
  /** Ids de las filas por las que se ha entrado. Vacío = primer nivel. */
  ruta: string[];
};

export type AccionDesglose =
  | { tipo: "seleccionar"; id: string }
  | { tipo: "limpiar" }
  | { tipo: "entrar"; id: string }
  | { tipo: "subir" };

export const ESTADO_INICIAL: EstadoDesglose = { seleccion: null, ruta: [] };

/**
 * Puro. Dos reglas que parecen detalle:
 *
 *  - **Seleccionar lo ya seleccionado lo suelta.** Es lo que espera quien pulsa dos veces, y
 *    sin eso no habría forma de deshacer con el ratón: `Escape` es de teclado.
 *  - **Entrar y subir LIMPIAN la selección.** Un id del nivel anterior no significa nada en
 *    el siguiente; conservarlo dejaría una fila atenuada sin que nada estuviera fijado.
 */
export function reducirDesglose(estado: EstadoDesglose, accion: AccionDesglose): EstadoDesglose {
  switch (accion.tipo) {
    case "seleccionar":
      return {
        ...estado,
        seleccion: estado.seleccion === accion.id ? null : accion.id,
      };
    case "limpiar":
      return estado.seleccion === null ? estado : { ...estado, seleccion: null };
    case "entrar":
      return { seleccion: null, ruta: [...estado.ruta, accion.id] };
    case "subir":
      return estado.ruta.length === 0
        ? estado
        : { seleccion: null, ruta: estado.ruta.slice(0, -1) };
  }
}

/** Las filas del nivel actual, siguiendo la ruta. Si un tramo no existe, se queda donde pudo. */
export function filasDelNivel(
  raiz: readonly FilaDesglose[],
  ruta: readonly string[],
): FilaDesglose[] {
  let filas: FilaDesglose[] = [...raiz];
  for (const id of ruta) {
    const hijos = filas.find((f) => f.id === id)?.hijos;
    if (!hijos || hijos.length === 0) return filas;
    filas = [...hijos];
  }
  return filas;
}

/** El color de una fila por id, buscando en todo el árbol. `undefined` si no lo tiene. */
export function colorDeFila(filas: readonly FilaDesglose[], id: string): string | undefined {
  for (const f of filas) {
    if (f.id === id) return f.color;
    if (f.hijos) {
      const hallado = colorDeFila(f.hijos, id);
      if (hallado !== undefined) return hallado;
    }
  }
  return undefined;
}

/**
 * El color con el que se pinta un nivel del desglose.
 *
 * Dentro de un sobre, **todas las filas van del color del sobre**. Repartir seis colores
 * categóricos entre las partes de una sola categoría diría que son cosas distintas cuando son
 * la misma cosa desmenuzada; el color ya lo gastó el nivel de arriba para separar sobres
 * entre sí. Uniforme, el nivel se lee como «esto es todo Supermercado».
 *
 * En la raíz no hay padre, así que cada fila usa el suyo.
 */
export function colorDelNivel(
  filas: readonly FilaDesglose[],
  ruta: readonly string[],
): string | undefined {
  const padre = ruta[ruta.length - 1];
  return padre === undefined ? undefined : colorDeFila(filas, padre);
}
