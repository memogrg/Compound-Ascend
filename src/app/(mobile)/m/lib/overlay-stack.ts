/**
 * Pila de overlays abiertos (hojas, menú, diálogos, candado). Sirve para una sola
 * pregunta: cuando el botón Atrás de Android suena, ¿hay algo encima que cerrar?
 *
 * Es un array de módulo, sin React a propósito. El listener nativo del botón Atrás se
 * registra UNA vez y vive fuera del árbol; si la pila fuera estado de React, el listener
 * leería un valor congelado del primer render. Un módulo se lee siempre al día.
 *
 * LIFO: se cierra el ÚLTIMO que se abrió, que es el que la persona está viendo. Como los
 * efectos de React corren en orden de montaje, un overlay anidado se registra después y
 * queda arriba solo.
 */

type Cerrar = () => void;

const pila: Cerrar[] = [];

/**
 * Registra un overlay abierto. Devuelve la función para darlo de baja — pensada para
 * retornarla tal cual desde la limpieza de un `useEffect`.
 *
 * Darlo de baja es idempotente y no tiene que ser desde el tope: un overlay que se cierra
 * por debajo de otro se saca de en medio sin alterar el orden de los que quedan.
 */
export function pushOverlay(close: Cerrar): () => void {
  pila.push(close);
  let dadoDeBaja = false;
  return () => {
    if (dadoDeBaja) return;
    dadoDeBaja = true;
    const i = pila.lastIndexOf(close);
    if (i !== -1) pila.splice(i, 1);
  };
}

/**
 * Cierra el overlay de más arriba. Devuelve `false` si no había ninguno, que es como
 * quien llama sabe que el gesto le toca a él.
 *
 * Saca el overlay de la pila ANTES de cerrarlo: cerrar dispara el `onClose` del
 * componente, que al desmontarse va a darse de baja solo, y esa baja tiene que
 * encontrarse con la pila ya limpia en vez de sacar a otro.
 */
export function closeTopOverlay(): boolean {
  const close = pila.pop();
  if (!close) return false;
  close();
  return true;
}
