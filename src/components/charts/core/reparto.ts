/**
 * Reparto de mayor resto para MONTOS: las partes enteras suman exactamente el total que se
 * muestra.
 *
 * Redondear cada parte por su cuenta no conserva la suma. Con 27.639.264,6 y 4.917.560,6 el
 * total es 32.556.825,2 —que se muestra 32.556.825— pero las partes redondeadas dan
 * 27.639.265 y 4.917.561, o sea 32.556.826. La tarjeta afirma un total y sus propias líneas
 * suman otro: el usuario ve el descuadre y deja de creerle a las dos cifras.
 *
 * El método: se reparte la parte entera (el suelo) de cada parte, se cuenta cuántas unidades
 * faltan para el total mostrado, y esas unidades van a las partes con MAYOR resto decimal.
 * En empate gana la de índice menor, para que el resultado sea determinista: dos renders con
 * los mismos datos tienen que dar exactamente lo mismo, o la cifra «baila» entre recargas.
 *
 * No es un cálculo financiero: nadie cobra ni paga estos enteros. Es lo que se PINTA, y por
 * eso vive en el núcleo de gráficos y no en el motor de patrimonio.
 */

/**
 * Reparte `total` entre las partes de `valores`, proporcionalmente a ellas, en enteros que
 * suman exactamente `Math.round(total)`.
 *
 * Con `total` omitido se usa la suma de `valores`, que es el caso normal: «estas partes, sin
 * que el redondeo cambie su suma».
 */
export function repartoMayorResto(valores: readonly number[], total?: number): number[] {
  const finitos = valores.map((v) => (Number.isFinite(v) ? v : 0));
  if (finitos.length === 0) return [];

  const suma = finitos.reduce((a, b) => a + b, 0);
  const objetivo = Math.round(total ?? suma);

  // Sin masa que repartir no hay proporción posible: todo a cero salvo el objetivo, que se
  // pone en la primera parte para no perderlo en silencio.
  if (suma === 0) {
    const out = finitos.map(() => 0);
    if (objetivo !== 0 && out.length > 0) out[0] = objetivo;
    return out;
  }

  // Sin total explícito se trabaja sobre los valores PROPIOS, no sobre una versión
  // reescalada. Reescalar por `objetivo/suma` mueve los restos decimales —con 27.639.264,6 y
  // 4.917.560,6 los deja en 0,43 y 0,57 en vez de 0,6 y 0,6— y la unidad sobrante cambia de
  // parte por un factor de 0,999999994. Cada parte tiene que quedar a menos de 1 de su
  // propio valor; eso es lo que significa «redondear sin descuadrar».
  //
  // Con un total explícito distinto de la suma no hay otra: la proporción es lo único que
  // define cuánto le toca a cada parte.
  const explicito = total !== undefined && Math.round(total) !== Math.round(suma);
  const escalados = explicito ? finitos.map((v) => (v / suma) * objetivo) : finitos;
  const suelos = escalados.map((v) => Math.floor(v));
  let faltan = objetivo - suelos.reduce((a, b) => a + b, 0);

  const orden = escalados
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    // Mayor resto primero; en empate, el índice menor. Determinista a propósito.
    .sort((a, b) => b.resto - a.resto || a.i - b.i);

  const out = [...suelos];
  // `faltan` puede ser negativo si los escalados tienen suelos por encima del objetivo
  // (ocurre con valores negativos): se quita en el orden inverso, por el mismo criterio.
  let k = 0;
  while (faltan > 0 && orden.length > 0) {
    out[orden[k % orden.length]!.i]! += 1;
    faltan -= 1;
    k += 1;
  }
  k = 0;
  while (faltan < 0 && orden.length > 0) {
    const idx = orden[orden.length - 1 - (k % orden.length)]!.i;
    out[idx]! -= 1;
    faltan += 1;
    k += 1;
  }
  return out;
}
