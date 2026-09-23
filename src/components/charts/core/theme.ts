import { formatMonthShort } from "@/lib/format";

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
  /**
   * Hacia dónde es BUENO que se mueva esta serie. Decide el color del delta vs comparación:
   * en ingresos subir es bueno, en gastos es malo. Sin esto, el tooltip pintaría de verde una
   * subida de gasto. Si no se declara, el delta va en neutro.
   */
  sentidoBueno?: "arriba" | "abajo";
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

/**
 * Alto que ocupa el tooltip anclado arriba en un puntero grueso, más su respiro.
 *
 * **150 px medidos** sobre el caso peor de las muestras (cabecera + tres filas con delta +
 * nota), más 10 de respiro. En táctil el gráfico RESERVA este espacio con `margin.top`, en vez
 * de dejar que el tooltip flote sobre el trazado: anclarlo arriba no sirve de nada si al
 * hacerlo tapa la curva que se está recorriendo con el dedo. En escritorio no se reserva —
 * ahí el tooltip sigue al ratón y se aparta solo.
 *
 * Es una constante y no una medición en vivo porque medir obligaría a un ciclo
 * render → medir → re-render en cada punto. Si un tooltip futuro crece más (más de tres
 * series con delta y nota a la vez), el test táctil lo caza: comprueba que la caja del
 * tooltip NO se solapa con la de la rejilla.
 */
export const ALTO_TOOLTIP_ANCLADO = 160;

/** Alto mínimo de un gráfico. Por debajo, los ejes y el tooltip no caben. */
export const ALTO_MINIMO = 160;

/**
 * La etiqueta del eje X, y la MISMA en la cabecera del tooltip.
 *
 * Que el eje diga «ago 26» y el tooltip «2026-08-01» es el defecto más común en un gráfico y
 * el más fácil de colar: son dos formateadores distintos escritos en sitios distintos. Acá hay
 * uno solo y las tres muestras lo comparten.
 *
 * Delega en `formatMonthShort` de `format.ts` —determinista, sin `Intl`— y deja pasar lo que
 * no sea una fecha ISO: las etiquetas ya legibles («abr», «may») se escriben tal cual.
 */
export function formatoEjeX(label: string | number | undefined): string {
  if (label === undefined || label === null) return "";
  const s = String(label);
  return /^\d{4}-\d{2}/.test(s) ? formatMonthShort(s) : s;
}

/**
 * Sincronización entre gráficos: `grupoSync` en `ChartFrame` → `syncId` de Recharts, con
 * `syncMethod="value"`.
 *
 * **Qué sincroniza: el tooltip y el crosshair.** Dos gráficos del mismo grupo muestran el
 * mismo periodo a la vez, que es lo que se quiere cuando están apilados en una pantalla.
 *
 * **Qué NO sincroniza: el resaltado de serie.** Eso vive en `useSerieActiva`, es de cada
 * gráfico y no cruza: señalar «Presupuesto» en el de abajo no tiene por qué atenuar nada en
 * el de arriba, donde esa serie ni existe.
 *
 * `"value"` y no el `"index"` por defecto: casa por el valor del eje categórico, así que dos
 * series de distinta longitud (12 meses y 7) se alinean por el MES y no por la posición. Con
 * `"index"`, el punto 3 de una se emparejaría con el punto 3 de la otra aunque sean meses
 * distintos — el propio tipo de Recharts avisa de que con longitudes distintas «this might
 * yield unexpected results».
 */
export const SYNC_METHOD = "value" as const;

/** El crosshair pasa de punteado a SÓLIDO cuando el tooltip está fijado: el estado se ve. */
export const CROSSHAIR_FIJO = {
  color: "var(--chart-crosshair)",
  ancho: 1.5,
  patron: undefined,
} as const;
