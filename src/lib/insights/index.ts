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
  syncInsights,
  dismissInsight,
  isStale,
} from "@/lib/insights/insights-service";
