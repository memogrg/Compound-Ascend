/** Barrel público del Módulo 5 — Mi Rich Life. */
export {
  computeRichLifeIndicators,
  computeRichLifeScore,
  buildRichLifeSnapshot,
} from "./engine/rich-life-engine";
export {
  getRichLifeSummary,
  buildDemoRichLifeSummary,
  aggregateNetWorth,
} from "./services/rich-life-service";
export { RichLifeDashboard } from "./components/rich-life-dashboard";
export { RichActions } from "./components/rich-actions";
export type { RichLifeSummary, NetWorthAggregate } from "./services/rich-life-service";
