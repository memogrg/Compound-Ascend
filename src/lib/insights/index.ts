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
  isStale,
} from "@/lib/insights/insights-service";

export {
  detectStalledGoals,
  detectGrowingDebt,
  detectPositiveStreak,
  detectDisfruteSpike,
  runDetectors,
} from "@/lib/insights/detectors";
