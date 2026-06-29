/**
 * Regresión del pack de seguridad menor (auditoría TOP #10):
 *  - Webhooks (payment / whatsapp) con rate-limit: la firma sigue siendo la
 *    defensa real; esto corta el costo de CPU de intentos masivos.
 *  - /api/assistant/chat emite headers CORS también en la respuesta de éxito
 *    (antes solo validaba origen sin reflejar los headers).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let rateLimitOk = true;
const rateLimitMock = vi.fn(async (_key: string, _limits: unknown) => ({
  ok: rateLimitOk,
  remaining: rateLimitOk ? 9 : 0,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (key: string, limits: unknown) => rateLimitMock(key, limits),
  RATE_LIMITS: {
    webhook: { limit: 30, windowMs: 60_000 },
    aiChat: { limit: 20, windowMs: 60_000 },
  },
  clientIp: () => "9.9.9.9",
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    PAYMENT_WEBHOOK_SECRET: "whsec",
    TWILIO_AUTH_TOKEN: "tok",
    ALLOWED_ORIGINS: "https://app.ejemplo.com",
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/security/webhook", () => ({ verifySignature: vi.fn(() => false) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/whatsapp/twilio-signature", () => ({ verifyTwilioSignature: vi.fn(() => false) }));
vi.mock("@/lib/whatsapp", () => ({ getWhatsAppProvider: vi.fn() }));
vi.mock("@/lib/whatsapp/router", () => ({ routeInbound: vi.fn() }));

// assistant/chat: todo mockeado para llegar al return de éxito.
vi.mock("@/lib/ai/orchestrator", () => ({
  financeChat: vi.fn(async () => ({ reply: "hola", action: null, usage: { totalTokens: 10 } })),
  financeChatWithTools: vi.fn(async () => ({ reply: "hola", action: null, usage: { totalTokens: 10 } })),
}));
vi.mock("@/lib/ai/context-engine", () => ({ buildFinancialContext: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai/usage", () => ({
  assertTokenBudget: vi.fn(async () => undefined),
  recordUsage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/session", () => ({
  getUser: vi.fn(async () => ({ id: "user-1" })),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/server/observability/alerts", () => ({ alert: vi.fn() }));

import { POST as paymentWebhook } from "@/app/api/webhooks/payment/route";
import { POST as whatsappWebhook } from "@/app/api/whatsapp/webhook/route";
import { POST as chat } from "@/app/api/assistant/chat/route";

beforeEach(() => {
  rateLimitOk = true;
  rateLimitMock.mockClear();
});

describe("webhooks con rate-limit", () => {
  it("payment: 429 al exceder el límite, ANTES de tocar la firma", async () => {
    rateLimitOk = false;
    const res = await paymentWebhook(
      new Request("http://localhost/api/webhooks/payment", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(429);
  });

  it("payment: dentro del límite la firma sigue mandando (403 firma inválida)", async () => {
    const res = await paymentWebhook(
      new Request("http://localhost/api/webhooks/payment", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(403);
    expect(rateLimitMock).toHaveBeenCalledWith("webhook:pay:9.9.9.9", expect.anything());
  });

  it("whatsapp: 429 al exceder el límite", async () => {
    rateLimitOk = false;
    const res = await whatsappWebhook(
      new Request("http://localhost/api/whatsapp/webhook", { method: "POST", body: "a=b" }),
    );
    expect(res.status).toBe(429);
  });
});

describe("assistant/chat refleja CORS en éxito", () => {
  it("con origen permitido, la respuesta 200 lleva Access-Control-Allow-Origin", async () => {
    const res = await chat(
      new Request("http://localhost/api/assistant/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://app.ejemplo.com",
        },
        body: JSON.stringify({ message: "hola", history: [] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.ejemplo.com");
  });
});
