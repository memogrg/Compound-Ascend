/**
 * Cuánto aire hace falta a la derecha para que el ÚLTIMO rótulo del eje X no se recorte.
 *
 * El problema no es igual en todos los gráficos, y conviene decirlo porque cambia dónde se aplica:
 *
 *  · **Escala de puntos** (`LineChart`, `AreaChart`): el primer y el último tick caen sobre los
 *    BORDES del área de trazado, así que la mitad del rótulo se sale. «sep 2026» a 11 px mide unos
 *    45 px, y con los 8 px de margen que había se recortaban ~14.
 *  · **Escala de banda** (`ComposedChart` con barras, como el histórico): el rótulo va centrado en
 *    su banda, no en el borde, así que solo se recorta si la media banda es más estrecha que el
 *    medio rótulo — lo que pasa cuando hay muchas columnas.
 *
 * El ancho se ESTIMA en vez de medirse. Medirlo exigiría un ciclo render → medir → re-render en
 * cada cambio de datos, y el error de la estimación se cubre redondeando hacia arriba. El factor
 * sale de la fuente del eje: 0,6 em por carácter es el ancho medio de un dígito o una letra
 * minúscula en la familia del cuerpo, el mismo valor que ya usa `DonutCenter` para su auto-ajuste.
 */

/** Ancho medio de carácter, en em. */
const ANCHO_CARACTER = 0.6;

/** Ancho estimado de un texto a un tamaño de fuente dado, en píxeles. */
export function anchoDeTexto(texto: string, tamanoFuente: number): number {
  return Math.ceil(texto.length * ANCHO_CARACTER * tamanoFuente);
}

/**
 * Aire a la derecha para una escala de PUNTOS: la mitad del rótulo, que es lo que sobresale.
 *
 * `minimo` conserva el aire que el gráfico ya tenía por otras razones (que el trazado no muera
 * pegado al borde), para que este cálculo solo pueda AÑADIR.
 */
export function aireParaRotuloFinal(rotulo: string, tamanoFuente: number, minimo = 0): number {
  return Math.max(minimo, Math.ceil(anchoDeTexto(rotulo, tamanoFuente) / 2));
}

/**
 * Lo mismo para una escala de BANDA, donde la banda ya protege media etiqueta.
 *
 * Devuelve 0 cuando la banda es lo bastante ancha: ahí añadir aire desalinearía este eje del de la
 * marca, que no lo lleva — el motivo por el que el histórico no llevaba `padding` en su `XAxis`.
 */
export function aireEnBanda(
  rotulo: string,
  tamanoFuente: number,
  anchoBanda: number,
  minimo = 0,
): number {
  const sobresale = anchoDeTexto(rotulo, tamanoFuente) / 2 - anchoBanda / 2;
  return Math.max(minimo, Math.ceil(Math.max(0, sobresale)));
}
