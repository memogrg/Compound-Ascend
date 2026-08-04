/** Barrel público del panel. */
export { DashboardView } from "./components/dashboard-view";
export { getDashboardData } from "./services/dashboard-service";
export { buildInsights } from "./engine/insights";
export { buildPanel } from "./engine/pillars";
export type { DashboardData } from "./services/dashboard-service";
export type { DashboardInsights, Insight } from "./engine/insights";
export type { PanelVM, NorteVM, PillarVM } from "./engine/pillars";

// Piloto Inicio · Delta 1: capa de datos del carrusel del home
export { getHomeCardsData } from "./services/home-cards-service";
export {
  selectPresupuesto,
  selectIngresos,
  selectGastos,
  selectAhorros,
  selectDeudas,
  selectInversiones,
  selectProteccion,
  selectPatrimonio,
  selectLibertad,
  deriveFundFlags,
  deriveFundAmounts,
} from "./engine/home-cards";
export type {
  HomeCards,
  PresupuestoCard,
  IngresosCard,
  GastosCard,
  AhorrosCard,
  DeudasCard,
  InversionesCard,
  ProteccionCard,
  PatrimonioCard,
  LibertadCard,
  MilestoneStep,
  Tone,
  VsMes,
} from "./engine/home-cards";
