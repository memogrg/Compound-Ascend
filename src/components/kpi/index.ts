/**
 * Primitivas de KPI. Se importa SIEMPRE desde acá, nunca de un archivo interno.
 */
export { KpiHero, textoHero } from "./kpi-hero";
export { KpiCard } from "./kpi-card";
export { DeltaChip, describirDelta } from "./delta-chip";
export type { SentidoBueno, DescripcionDelta } from "./delta-chip";
export { Sparkline, pathSparkline } from "./sparkline";
export { Meter, severidadMeter, textoMeter } from "./meter";
export type { UmbralesMeter, SeveridadMeter } from "./meter";
export { partesNumero, textoNumero, digitosNumero, LOCALE_NUMERICO } from "./numero-animado";
export type { PartesNumero, FormatoNumero } from "./numero-animado";
