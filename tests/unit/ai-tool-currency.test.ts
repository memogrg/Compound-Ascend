import { describe, it, expect, vi, beforeEach } from "vitest";

// El toolContext de la herramienta de deuda debe usar la moneda PRINCIPAL del
// usuario (user_settings.primary_currency), NO getDisplayCurrency() — que honra la
// cookie de visualización y haría que un cálculo use la moneda con la que el usuario
// mira el dashboard.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/cors", () => ({
  assertTrustedOrigin: () => true,
  corsHeaders: () => ({}),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async () => ({ ok: true, remaining: 9 }),
  clientIp: () => "1.1.1.1",
  RATE_LIMITS: { aiChat: { limit: 20, windowMs: 60_000 } },
}));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "u1" }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/ai/usage", () => ({
  assertTokenBudget: async () => {},
  recordUsage: async () => {},
}));
vi.mock("@/lib/ai/context-engine", () => ({
  buildFinancialContext: async () => ({ currency: "CRC" }),
}));
vi.mock("@/server/observability/alerts", () => ({ alert: vi.fn() }));
vi.mock("@/modules/control", () => ({
  listDebts: async () => [
    { id: "d1", name: "Tarjeta USD", balance: 1000, minPayment: 50, apr: 30, currency: "USD" },
  ],
}));
vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => ({ USD: 1, CRC: 500 }),
}));

const getPrimaryCurrency = vi.fn(async () => "CRC");
const getDisplayCurrency = vi.fn(async () => "USD"); // el override de visualización
vi.mock("@/modules/financial-base", () => ({
  getPrimaryCurrency: () => getPrimaryCurrency(),
  getDisplayCurrency: () => getDisplayCurrency(),
}));

// financeChatWithTools se intercepta para capturar el toolContext; normalizeDebtsForTool
// queda REAL (convierte de verdad la deuda USD → CRC).
const financeChatWithTools = vi.fn(async (..._args: unknown[]) => ({
  reply: "ok",
  action: null,
  tokensIn: 1,
  tokensOut: 1,
  provider: "stub",
}));
vi.mock("@/lib/ai/orchestrator", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/ai/orchestrator")>();
  return { ...actual, financeChatWithTools: (...a: unknown[]) => financeChatWithTools(...a) };
});

import { POST } from "@/app/api/assistant/chat/route";

type CapturedToolContext = { currency: string; fxUnavailable?: boolean; debts: { balance: number }[] };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("chat route · moneda del toolContext", () => {
  it("usa la moneda principal (no el override de visualización) y normaliza FX", async () => {
    const req = new Request("http://localhost/api/assistant/chat", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ message: "¿en cuántos meses pago mis deudas?", history: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(financeChatWithTools).toHaveBeenCalledTimes(1);
    const toolContext = financeChatWithTools.mock.calls[0]![2] as CapturedToolContext;

    expect(toolContext.currency).toBe("CRC"); // principal, NO el display USD
    expect(getPrimaryCurrency).toHaveBeenCalled();
    expect(getDisplayCurrency).not.toHaveBeenCalled();
    // la deuda en USD se normalizó a la principal (1000 USD × 500 = 500000 CRC)
    expect(toolContext.debts[0]!.balance).toBe(500_000);
  });
});
