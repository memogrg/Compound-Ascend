/**
 * Superficie pública del núcleo de gráficos. Se importa SIEMPRE desde acá:
 * `@/components/charts/core`, nunca de un archivo suelto.
 *
 * Los tres wrappers viejos (`area-chart`, `line-chart`, `donut-chart`) siguen intactos y
 * fuera de este núcleo; pasarán a delegar en él en el delta 7 de esta fase.
 */
export { ChartFrame, type EstadoGrafico } from "./chart-frame";
export { ChartTooltip, type PayloadTooltip } from "./chart-tooltip";
export { GradientDefs, useGradientIds } from "./gradient-defs";
export { GlowFilter, useGlowId } from "./glow-filter";
export { Legend } from "./legend";
export {
  ESTADO_INICIAL,
  esVisible,
  opacidadDe,
  reducirSerieActiva,
  seriesVisibles,
  useSerieActiva,
  type AccionSerie,
  type EstadoSerie,
} from "./use-serie-activa";
export { ANCHO_TOOLTIP_ESTIMADO, posicionAnclada } from "./interaccion";
export {
  SIN_COMPARACION,
  deltaComparacion,
  filasTooltip,
  tonoDelta,
  type Delta,
  type FilaTooltip,
  type FilasRecortadas,
} from "./tooltip-datos";
export {
  describirGrafico,
  describirPunto,
  tablaDeDatos,
  SIN_DATO,
  type FilaDato,
  type PuntoDescribible,
  type TablaDatos,
} from "./accesible";
export {
  ALTO_MINIMO,
  ALTO_TOOLTIP_ANCLADO,
  ANIMACION_ACTIVA,
  AREA,
  CROSSHAIR_FIJO,
  SYNC_METHOD,
  curvaDe,
  formatoEjeX,
  BARRA,
  CROSSHAIR,
  EJE,
  OPACIDAD,
  PUNTO_ACTIVO,
  REJILLA,
  TRAZO,
  type MarcaSerie,
  type SerieDef,
} from "./theme";
export { dominioBarras, escalaBarras, niceDomain } from "./escala";
export { usarAncho, anchoDeBarra } from "./usar-ancho";
export { escalaNice, incluyeCero, type Escala, type OpcionesEscala } from "./escala-nice";

export { CalendarioGasto, INSTRUCCIONES_TECLADO, type DiaGasto } from "./calendario-gasto";
export {
  cuantiles,
  diaDeLaSemana,
  diasDelMes,
  gridDelMes,
  nivelDe,
  rangosDeNivel,
  etiquetasDeRango,
  type CeldaCalendario,
} from "./calendario";
export { recortar, presetsUtiles, mesesHaciaAtras, NOMBRE_RANGO, type RangoPreset } from "./rangos";
