/**
 * Alertas operativas estructuradas. Hoy se emiten al logger; el `dispatch` es el
 * punto único para enchufar un destino externo (Sentry, PagerDuty, Slack) sin
 * tocar los call-sites. No incluye secretos ni PII.
 */
import { logger } from "@/lib/logger";

export type AlertKind =
  | "token_abuse" // consumo de IA anómalo
  | "provider_failure" // IA o market-data caídos
  | "rate_limit_storm" // muchos 429
  | "auth_anomaly" // intentos sospechosos
  | "critical_error"; // error 5xx inesperado

export type AlertSeverity = "warn" | "critical";

export function alert(
  kind: AlertKind,
  severity: AlertSeverity,
  meta: Record<string, unknown> = {},
): void {
  const payload = { alert: kind, severity, ...meta };
  if (severity === "critical") logger.error("ALERT", payload);
  else logger.warn("ALERT", payload);
  // TODO(prod): dispatch(payload) → transporte externo (Sentry/Slack/PagerDuty).
}
