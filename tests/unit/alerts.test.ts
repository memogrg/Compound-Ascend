/**
 * Alertas operativas → Slack. Verifica que `alert()` despacha al webhook cuando
 * está configurado, no hace nada si falta, y nunca lanza (fire-and-forget).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { alert } from "@/server/observability/alerts";

const WEBHOOK = "https://hooks.slack.com/services/T/B/X";

describe("alert() · dispatch a Slack", () => {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response("ok")));

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    delete process.env.SLACK_ALERT_WEBHOOK_URL;
    vi.unstubAllGlobals();
  });

  it("envía al webhook cuando SLACK_ALERT_WEBHOOK_URL está configurado", () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = WEBHOOK;
    alert("rate_limit_storm", "warn", { bucket: "ai-chat" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(WEBHOOK);
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(body.text).toContain("rate_limit_storm");
  });

  it("NO envía nada si el webhook no está configurado", () => {
    delete process.env.SLACK_ALERT_WEBHOOK_URL;
    alert("critical_error", "critical", { code: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no lanza aunque el transporte falle (fire-and-forget)", () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = WEBHOOK;
    fetchMock.mockRejectedValueOnce(new Error("red caída"));
    expect(() => alert("provider_failure", "critical", {})).not.toThrow();
  });
});
