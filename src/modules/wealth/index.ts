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
export { computeRentalRoi } from "./engine/rental-roi";
export type { RentalRoi, RentalRoiInput } from "./engine/rental-roi";
export {
  getWealthSummary,
  buildDemoWealthSummary,
  createPolicy,
  deletePolicy,
} from "./services/wealth-service";
export type { PolicyInput } from "./schemas";
export { addPolicyAction, setPeaceMonthsAction } from "./api/actions";
export { DefenseFunds } from "./components/defense-funds";
export { getPortfolioReport, getPortfolioMarketValues } from "./services/portfolio-service";
export { getPatrimonioReport, getPatrimonioReportForUser } from "./services/patrimonio-service";
export type { PatrimonioServiceResult } from "./services/patrimonio-service";
export type { PatrimonioReport, PatrimonioLevel, Hito } from "./engine/patrimonio-engine";
export type { EssentialBreakdown } from "./engine/essential-expense";
// Dimensionamiento de los fondos de defensa (F1).
export {
  computeDefenseFunds,
  sizeFund,
  emergencyTargetIn,
  isDefenseFundGoalType,
  monthsCovered,
  detectLongTermObligation,
  EMERGENCY_FUND_USD,
  PEACE_MONTHS_DEFAULT,
  PEACE_MONTHS_MIN,
  PEACE_MONTHS_MAX,
  FUND_HORIZON_MONTHS,
  type DefenseFundsPlan,
  type FundSizing,
  type DebtSignal,
} from "./engine/fund-sizing";
export {
  getDefenseFundsReport,
  getPeaceMonths,
  setPeaceMonths,
  type DefenseFundsReport,
} from "./services/fund-sizing-service";
export { buildDailyPatrimonioInsight, RITUAL_KIND } from "./engine/daily-insight";
export { buildWeeklyDigest, type WeeklyDigest } from "./engine/weekly-digest";
export {
  getSnapshotHistory,
  generateAndSaveSnapshot,
  ensureTodaySnapshot,
} from "./services/snapshot-service";
export { getInvestmentInsights } from "./services/investment-insights";
export { getMacroInsights, type MacroInsight } from "./services/macro-insights";
export { GrowthView } from "./components/growth-view";
export { DefenseView } from "./components/defense-view";
export { WealthActions } from "./components/wealth-actions";
export { MilestoneLadder } from "./components/milestone-ladder";
export type { WealthSummary } from "./services/wealth-service";
export type {
  Investment,
  InsurancePolicy,
  PolicyType,
  ProtectionDiagnosis,
  PortfolioStats,
  Holding,
  HoldingPerformance,
  Dividend,
  PortfolioAnalytics,
  DividendAnalytics,
  CryptoAnalytics,
  PortfolioSnapshot,
  InvestmentInsights,
} from "./types";
