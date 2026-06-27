/** Barrel público del panel. */
export { DashboardView } from "./components/dashboard-view";
export { getDashboardData } from "./services/dashboard-service";
export { buildInsights } from "./engine/insights";
export { buildPanel } from "./engine/pillars";
export type { DashboardData } from "./services/dashboard-service";
export type { DashboardInsights, Insight } from "./engine/insights";
export type { PanelVM, NorteVM, PillarVM } from "./engine/pillars";
