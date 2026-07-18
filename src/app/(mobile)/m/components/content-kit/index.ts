/**
 * Kit de CONTENIDO móvil ("Cristal Cálido" · R3): primitivas de presentación reutilizables
 * por todas las pantallas /m, derivadas del nivel de acabado de Inicio. Hermano del
 * form-kit (que cubre crear/editar/eliminar); aquí no hay estado ni Server Actions:
 * los componentes reciben datos ya calculados y solo deciden cómo se ven.
 *
 * Reglas del sistema (ver el bloque "KIT DE CONTENIDO" en mobile.css):
 *  - El contenido NO usa cristal: eso es solo chrome (topbar/tabbar/hojas/menú).
 *    Aquí: superficie clara + sombra suave, sin marcos duros.
 *  - Radios 22 (resumen de pantalla) / 16 (tarjetas de contenido); ritmo 16/12/8.
 *  - Números en Space Mono tabular con color semántico; mAmount() abrevia donde aprieta.
 *  - Iconografía monolínea (MIcon), nunca emojis.
 *
 * Sin hooks: se pueden usar desde server components (con props serializables) o desde
 * client components (que además pueden pasar onClick).
 */
export { MSummaryCard } from "./summary-card";
export { MSectionHeader } from "./section-header";
export { MDataRow } from "./data-row";
export { MMetricGrid, MMetricCard } from "./metric-grid";
export { MChip } from "./chip";
export { MEmptyState } from "./empty-state";
export { MContentCard } from "./content-card";
export { MProgress } from "./progress";
export { mAmount, mAmountScale, TONE_BADGE, TONE_FILL, TONE_TEXT } from "./tone";
export type { MTone } from "./tone";
