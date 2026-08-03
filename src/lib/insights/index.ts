/**
 * Memoria conductual (insights del asesor). Importar siempre desde este barrel.
 */
export type {
  InsightSeverity,
  InsightStatus,
  InsightRelatedKind,
  InsightKind,
  DetectedInsight,
  Insight,
} from "@/lib/insights/types";

export {
  getActiveInsights,
  getInsightsFreshness,
  refreshInsights,
  syncInsights,
  dismissInsight,
  restoreDismissedInsights,
  isStale,
} from "@/lib/insights/insights-service";

export {
  detectStalledGoals,
  detectGrowingDebt,
  detectPositiveStreak,
  detectDisfruteSpike,
  detectOverspentEnvelopes,
  detectLowSavingsRate,
  detectExpensiveDebt,
  detectEmergencyFundGap,
  detectConcentration,
  detectReturnBelowInflation,
  runDetectors,
  APR_CARO,
  CONCENTRACION_ALTA,
} from "@/lib/insights/detectors";

export { suggestedAction, type InsightAction } from "@/lib/insights/actions";
