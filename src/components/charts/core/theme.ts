/**
 * Las constantes de marca de los gráficos. Un solo sitio donde está escrito qué es «premium»
 * en CARTERA+: grosores, radios, opacidades y qué token usa cada cosa.
 *
 * Regla dura, y hay un test que la vigila: **acá no se escribe ningún color literal**. Todo
 * color sale de un token (`var(--chart-N)`, `var(--chart-grid)`, …). Un hex suelto en este
 * archivo es un color que no cambia con el tema y que nadie encuentra después.
 */

/** Cómo se dibuja una serie. Decide el swatch de la leyenda y el relleno del área. */
export type MarcaSerie = "linea" | "area" | "barra";

export type SerieDef = {
  /** Clave del dato en cada punto. Es también la identidad de la serie. */
  clave: string;
  etiqueta: string;
  /** Token de color, p. ej. `var(--chart-1)`. Pertenece a la ENTIDAD, no al índice. */
  color: string;
  marca: MarcaSerie;
  /** Trazo discontinuo: se usa para proyecciones, que no son un dato observado. */
  guion?: boolean;
};

/**
 * Trazo de 2 px con uniones redondeadas. Por debajo de 2 px la curva se rompe en pantallas
 * densas; por encima, una serie tapa a la de al lado cuando se cruzan.
 */
export const TRAZO = {
  ancho: 2,
  union: "round",
  remate: "round",
} as const;

/**
 * Punto activo de ≥ 8 px con anillo del color de la superficie: el anillo es lo que lo
 * separa de la línea cuando el valor cae sobre ella. Sin anillo, el punto se «come» el trazo.
 */
export const PUNTO_ACTIVO = {
  radio: 4.5,
  anilloAncho: 2,
  anilloColor: "var(--surface)",
} as const;

/**
 * La lavada del área: 0,18 arriba y 0 abajo.
 *
 * Vive acá y no en el token `--chart-gradient-top` (0,28) a propósito: medido sobre el
 * gráfico real, con 0,28 el relleno tapa la rejilla y, con dos series superpuestas, la de
 * abajo deja de leerse. 0,18 sigue dando cuerpo al área sin competir con la línea, que es la
 * que lleva el dato. La divergencia con el token queda anotada para el delta 7, que es cuando
 * los wrappers viejos pasan por acá y hay un solo sitio donde decidirlo.
 */
export const AREA = {
  opacidadTope: 0.18,
  opacidadBase: 0,
} as const;

/** Rejilla de 1 px sólida. Discontinua compite con la serie de proyección, que sí lo es. */
export const REJILLA = {
  ancho: 1,
  color: "var(--chart-grid)",
  discontinua: false,
} as const;

export const EJE = {
  color: "var(--chart-axis)",
  tamanoFuente: 11,
} as const;

export const CROSSHAIR = {
  color: "var(--chart-crosshair)",
  ancho: 1,
  patron: "3 3",
} as const;

/**
 * Barras de 24 px como máximo con radio solo en el extremo: redondear los cuatro lados hace
 * que una barra pequeña parezca una píldora y pierda su base. 2 px de aire entre barras.
 */
export const BARRA = {
  anchoMaximo: 24,
  radio: 4,
  /** Entre las barras de un MISMO mes: 2 px, solo para que no se toquen. */
  separacion: 2,
  /**
   * Entre grupos de meses. En porcentaje porque Recharts lo mide contra el ancho de la
   * banda: un valor fijo se come el gráfico cuando hay muchas categorías. El aire entre
   * meses tiene que ser claramente mayor que el de dentro del mes, o el ojo agrupa mal.
   */
  separacionCategoria: "28%",
} as const;

/**
 * Serie atenuada cuando otra está activa. 0,35 sigue siendo legible —atenuar no es ocultar,
 * y el dato tiene que poder leerse— pero deja claro cuál manda.
 */
export const OPACIDAD = {
  normal: 1,
  atenuada: 0.35,
} as const;

/**
 * La animación de entrada de Recharts va APAGADA en todo el núcleo.
 *
 * No es una decisión de gusto: con `ResponsiveContainer` la animación se re-dispara en cada
 * medición y el gráfico «late» al redimensionar, y en las capturas de QA introduce un estado
 * intermedio que no es determinista. El movimiento que sí queremos —el del punto activo y el
 * tooltip— es CSS y se apaga solo con `prefers-reduced-motion` a través de los `--dur-*`.
 */
export const ANIMACION_ACTIVA = false;

/** Alto mínimo de un gráfico. Por debajo, los ejes y el tooltip no caben. */
export const ALTO_MINIMO = 160;
