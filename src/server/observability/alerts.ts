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
  dispatch(kind, severity, meta);
}

/**
 * Transporte externo de la alerta. Hoy: webhook de Slack (Incoming Webhook),
 * gateado por env — si no está, solo queda el log. Fire-and-forget: nunca
 * bloquea ni lanza (una alerta no debe tumbar el flujo que la origina).
 *
 * `meta` es operativo (bucket, código, conteos), no PII; aun así no se envían
 * secretos. Para PagerDuty/otros, añadir aquí otro destino con la misma firma.
 */
function dispatch(kind: AlertKind, severity: AlertSeverity, meta: Record<string, unknown>): void {
  const url = process.env.SLACK_ALERT_WEBHOOK_URL?.trim();
  if (!url) return;
  const emoji = severity === "critical" ? "🔴" : "🟠";
  const text = `${emoji} *[${severity.toUpperCase()}] ${kind}* · CARTERA+\n\`\`\`${JSON.stringify(meta)}\`\`\``;
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).catch((err) => {
    logger.warn("alert: fallo al enviar al transporte externo", {
      message: err instanceof Error ? err.message : "?",
    });
  });
}
