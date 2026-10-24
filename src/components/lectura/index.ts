/**
 * Primitivas de LECTURA: las cuatro franjas que siguen al titular y al contexto.
 * Se importa siempre desde acá, nunca de un archivo interno.
 */
export { SectionHeader } from "./section-header";
export { BreakdownCard } from "./breakdown-card";
export { InsightList } from "./insight-list";
export { ActionStrip } from "./action-strip";

export {
  plegarOtros,
  porcentajesExactos,
  reducirDesglose,
  filasDelNivel,
  colorDeFila,
  colorDelNivel,
  ESTADO_INICIAL,
  ID_OTROS,
} from "./desglose";
export type { FilaDesglose, EstadoDesglose, AccionDesglose } from "./desglose";

export { desdeInsight, TONO_SEVERIDAD, LECTURA_SEVERIDAD } from "./insight-item";
export type { InsightItem, InsightSeverity } from "./insight-item";

export { desdeAction } from "./action-item";
export type { ActionStripData } from "./action-item";
