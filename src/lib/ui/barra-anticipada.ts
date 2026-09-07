/**
 * Reconciliación de una barra ANTICIPADA (optimista) — motor puro.
 *
 * El problema que resuelve: `useOptimistic` sostiene el valor sólo mientras dura
 * la transición. `router.refresh()` no devuelve promesa, así que la transición
 * termina apenas se dispara el refresh — NO cuando llegan las props frescas.
 * Entre esos dos instantes React ya descartó el optimista y la barra vuelve al
 * valor viejo: se llena y se vacía sola. Un movimiento de plata que aparece y
 * desaparece sin explicación es inaceptable, aunque la escritura haya andado.
 *
 * La regla acá NO usa tiempo: el anticipo se sostiene hasta que el servidor
 * REFLEJE el monto. Se compara el valor, no se espera un rato.
 *
 * Cada pendiente guarda dos números:
 *  · `esperado` — el total que el servidor tiene que alcanzar para dar por
 *    reconciliado. Se acumula si se marca varias veces seguidas.
 *  · `base` — lo que el servidor decía al anticipar. Es la salida de emergencia:
 *    si el servidor BAJA de ahí (alguien borró el movimiento en otra pestaña, o
 *    se revirtió), el anticipo se suelta en vez de quedar clavado para siempre.
 */

export type PendienteBarra = {
  /** Total que el servidor debe alcanzar para soltar el anticipo. */
  esperado: number;
  /** Valor del servidor en el momento de anticipar. */
  base: number;
};

export type PendientesBarra = Record<string, PendienteBarra>;

/** Tolerancia de centavos: el servidor redondea a 2 decimales. */
const EPSILON = 0.005;

/**
 * Anticipa `monto` en la fila `id`. Si ya había un anticipo sin reconciliar, se
 * acumula sobre él (dos clics seguidos esperan la suma de los dos).
 */
export function anticipar(
  estado: PendientesBarra,
  id: string,
  servidorActual: number,
  monto: number,
): PendientesBarra {
  if (!Number.isFinite(monto) || monto <= 0) return estado;
  const previo = estado[id];
  return {
    ...estado,
    [id]: {
      esperado: (previo?.esperado ?? servidorActual) + monto,
      base: previo?.base ?? servidorActual,
    },
  };
}

/**
 * Suelta el anticipo de `id` — la escritura falló. Se descarta entero: reponer
 * sólo una parte dejaría la barra en un número que nadie puede explicar.
 */
export function cancelar(estado: PendientesBarra, id: string): PendientesBarra {
  if (!estado[id]) return estado;
  const { [id]: _fuera, ...resto } = estado;
  return resto;
}

/**
 * Suelta los anticipos que el servidor ya refleja. Se llama con cada tanda de
 * props nuevas.
 *
 * Dos salidas, y las dos comparan VALORES:
 *  · el servidor alcanzó lo esperado → reconciliado, se suelta;
 *  · el servidor bajó por debajo de la base → el movimiento se deshizo por otra
 *    vía, el anticipo ya no tiene sentido y se suelta (si no, quedaría clavado).
 */
export function reconciliar(
  estado: PendientesBarra,
  servidor: Record<string, number>,
): PendientesBarra {
  let cambio = false;
  const salida: PendientesBarra = {};
  for (const [id, p] of Object.entries(estado)) {
    const actual = servidor[id] ?? 0;
    if (actual + EPSILON >= p.esperado || actual < p.base - EPSILON) {
      cambio = true;
      continue;
    }
    salida[id] = p;
  }
  // Devuelve el MISMO objeto si nada cambió: evita re-render en bucle cuando
  // esto corre dentro de un efecto sobre props nuevas.
  return cambio ? salida : estado;
}

/**
 * Valor a pintar. Mientras hay anticipo se muestra lo esperado, salvo que el
 * servidor ya lo haya pasado (otra pestaña sumó más): ahí manda el servidor.
 * Nunca se muestra MENOS de lo que el servidor dice.
 */
export function valorBarra(
  servidor: Record<string, number>,
  estado: PendientesBarra,
  id: string,
): number {
  const actual = servidor[id] ?? 0;
  const p = estado[id];
  return p ? Math.max(actual, p.esperado) : actual;
}
