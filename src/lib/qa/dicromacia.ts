/**
 * Matrices de simulación de dicromacia para `feColorMatrix`, compuestas a partir de **las mismas
 * constantes** que usa el validador de paleta (`tests/unit/contraste-paleta.test.ts`).
 *
 * No están copiadas de ninguna tabla de internet: se componen aquí, `LMS→RGB · proyección ·
 * RGB→LMS`, con los números de Viénot–Brettel del validador. Si el validador cambia de
 * constantes y esto no, el caso que compara las dos medidas se pone rojo — que es justamente
 * para lo que existe.
 *
 * **El espacio importa.** El validador linealiza el sRGB antes de transformar, y `feColorMatrix`
 * opera en `linearRGB` por defecto (es el valor inicial de `color-interpolation-filters` en SVG).
 * O sea que las dos hacen la cuenta en el mismo espacio. Si alguien pusiera
 * `color-interpolation-filters="sRGB"` en el filtro, la pantalla dejaría de coincidir con el
 * validador sin que ninguna de las dos cambiara un número.
 */

/** sRGB lineal → LMS (Hunt-Pointer-Estévez normalizado a D65), igual que el validador. */
const RGB_A_LMS = [
  [0.31399, 0.63951, 0.04649],
  [0.15537, 0.75789, 0.0867],
  [0.01775, 0.10945, 0.87262],
] as const;

/** LMS → sRGB lineal. La inversa de la de arriba. */
const LMS_A_RGB = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
] as const;

/**
 * La proyección de cada dicromacia sobre el plano que esa persona sí distingue.
 *
 * Protanopía: falta el cono L, y se reconstruye desde M y S. Deuteranopía: falta el M, desde L
 * y S. Tritanopía: falta el S, desde L y M.
 */
const PROYECCION = {
  protanopia: [
    [0, 1.05118294, -0.05116099],
    [0, 1, 0],
    [0, 0, 1],
  ],
  deuteranopia: [
    [1, 0, 0],
    [0.9513092, 0, 0.04866992],
    [0, 0, 1],
  ],
  tritanopia: [
    [1, 0, 0],
    [0, 1, 0],
    [-0.86744736, 1.86727089, 0],
  ],
} as const;

export type Dicromacia = keyof typeof PROYECCION;
export const DICROMACIAS = Object.keys(PROYECCION) as Dicromacia[];

type Matriz3 = readonly (readonly number[])[];

function multiplicar(a: Matriz3, b: Matriz3): number[][] {
  return a.map((fila) => b[0]!.map((_, j) => fila.reduce((s, v, k) => s + v * b[k]![j]!, 0)));
}

/**
 * La matriz 3×3 en RGB lineal para un tipo de dicromacia.
 *
 * Exportada aparte del `values` para que el test pueda comprobar la composición sin parsear una
 * cadena.
 */
export function matrizDicromacia(tipo: Dicromacia): number[][] {
  return multiplicar(LMS_A_RGB, multiplicar(PROYECCION[tipo], RGB_A_LMS));
}

/**
 * El atributo `values` de `feColorMatrix`: 4×5, con alfa intacto.
 *
 * Alfa intacto a propósito: la dicromacia es una pérdida de información de color, no de
 * opacidad. Tocarla haría que la simulación además atenuara la página, y cualquier medida de
 * contraste tomada encima estaría midiendo dos cosas.
 */
export function valoresFeColorMatrix(tipo: Dicromacia): string {
  const m = matrizDicromacia(tipo);
  const fila = (f: number[]) => `${f.map((v) => v.toFixed(6)).join(" ")} 0 0`;
  return [fila(m[0]!), fila(m[1]!), fila(m[2]!), "0 0 0 1 0"].join("  ");
}
