/** Barrel público del Módulo 4 — Patrimonio. */
export {
  computeReadiness,
  computeProtection,
  computeBalance,
  computePortfolio,
} from "./engine/wealth-engine";
export {
  getWealthSummary,
  buildDemoWealthSummary,
} from "./services/wealth-service";
export { GrowthView } from "./components/growth-view";
export { DefenseView } from "./components/defense-view";
export { WealthActions } from "./components/wealth-actions";
export type { WealthSummary } from "./services/wealth-service";
