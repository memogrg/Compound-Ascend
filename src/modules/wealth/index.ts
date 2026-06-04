/** Barrel público del Módulo 4 — Patrimonio. */
export {
  computeReadiness,
  computeProtection,
  computeBalance,
  computePortfolio,
} from "./engine/wealth-engine";
export {
  computeHoldingPerformance,
  computePortfolioAnalytics,
  computeGrowthScore,
  computeDividendAnalytics,
  computeCryptoAnalytics,
  buildInvestmentInsights,
} from "./engine/portfolio-engine";
export {
  getWealthSummary,
  buildDemoWealthSummary,
} from "./services/wealth-service";
export { getPortfolioReport, getPortfolioMarketValues } from "./services/portfolio-service";
export { getSnapshotHistory, generateAndSaveSnapshot } from "./services/snapshot-service";
export { getInvestmentInsights } from "./services/investment-insights";
export { GrowthView } from "./components/growth-view";
export { DefenseView } from "./components/defense-view";
export { WealthActions } from "./components/wealth-actions";
export type { WealthSummary } from "./services/wealth-service";
export type {
  Holding,
  HoldingPerformance,
  Dividend,
  PortfolioAnalytics,
  DividendAnalytics,
  CryptoAnalytics,
  PortfolioSnapshot,
  InvestmentInsights,
} from "./types";
