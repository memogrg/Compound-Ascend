/**
 * Regresión del pack de seguridad menor (auditoría TOP #10):
 *  - Webhook de Stripe con rate-limit: la firma sigue siendo la defensa real;
 *    esto corta el costo de CPU de intentos masivos.
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
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec",
    ALLOWED_ORIGINS: "https://app.ejemplo.com",
  }),
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// El webhook de Stripe lee las claves de process.env (no de getServerEnv): sin
// esto la ruta corta antes por "no configurado" y no se probaría la firma, que
// es justo la defensa que importa.
process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
vi.mock("@/lib/security/webhook", () => ({ verifySignature: vi.fn(() => false) }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: vi.fn() }));

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

import { POST as stripeWebhook } from "@/app/api/webhooks/stripe/route";
import { POST as chat } from "@/app/api/assistant/chat/route";

beforeEach(() => {
  rateLimitOk = true;
  rateLimitMock.mockClear();
});

describe("webhooks con rate-limit", () => {
  it("stripe: 429 al exceder el límite, ANTES de tocar la firma", async () => {
    rateLimitOk = false;
    const res = await stripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(429);
  });

  it("stripe: sin firma no pasa, aunque el rate-limit deje pasar", async () => {
    const res = await stripeWebhook(
      new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(403);
    expect(rateLimitMock).toHaveBeenCalledWith("webhook:stripe:9.9.9.9", expect.anything());
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
