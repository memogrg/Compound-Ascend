import { describe, it, expect, vi, beforeEach } from "vitest";

// CAMBIO 3.2 — handleText (vía routeInbound): con toolContext, invoca
// financeChatWithTools (no financeChat). El orchestrator va mockeado.

const { financeChatWithTools, TOOLCTX } = vi.hoisted(() => ({
  financeChatWithTools: vi.fn(async (..._a: unknown[]) => ({
    reply: "Te tardarías 8 meses.",
    action: null,
    tokensIn: 1,
    tokensOut: 1,
    provider: "stub",
  })),
  TOOLCTX: { currency: "CRC", fxUnavailable: false, debts: [] },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/orchestrator", () => ({
  financeChatWithTools: (...a: unknown[]) => financeChatWithTools(...a),
  scanReceipt: vi.fn(),
}));
vi.mock("@/lib/whatsapp/tool-context", () => ({
  buildWhatsAppToolContext: async () => TOOLCTX,
}));
vi.mock("@/lib/whatsapp/context-service", () => ({
  buildContextForUser: async () => ({ currency: "CRC" }),
}));
vi.mock("@/lib/ai/usage", () => ({
  assertTokenBudget: async () => {},
  recordUsage: async () => {},
}));
vi.mock("@/lib/ingestion/sources", () => ({ parseNotification: () => [] }));
vi.mock("@/lib/whatsapp/write-service", () => ({
  createTransactionForUser: async () => ({ ok: true }),
}));
vi.mock("@/lib/whatsapp/links-service", () => ({
  getActiveLinkByPhone: async () => ({
    id: "l1",
    userId: "u1",
    householdId: "h1",
    phone: "+50688880000",
  }),
  getPendingAction: async () => null,
  setPendingAction: async () => {},
  touchLastSeen: async () => {},
  activateLinkByOtp: async () => ({ ok: false, reason: "invalid" }),
  getUserDisplayName: async () => "Memo",
  getUserCurrency: async () => "CRC",
}));

import { routeInbound } from "@/lib/whatsapp/router";
import type { WhatsAppProvider } from "@/lib/whatsapp/provider";

function fakeProvider() {
  return {
    sendText: vi.fn(async () => ({ ok: true })),
    sendButtons: vi.fn(async () => ({ ok: true })),
    downloadMedia: vi.fn(async () => null),
  } as unknown as WhatsAppProvider;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("router handleText · function-calling en WhatsApp", () => {
  it("texto libre → invoca financeChatWithTools con el toolContext", async () => {
    const provider = fakeProvider();
    await routeInbound(provider, {
      phone: "+50688880000",
      body: "¿en cuántos meses pago mi deuda si abono 100000 extra?",
      numMedia: 0,
      mediaUrl: null,
      mediaType: null,
    });

    expect(financeChatWithTools).toHaveBeenCalledTimes(1);
    expect(financeChatWithTools.mock.calls[0]![2]).toEqual(TOOLCTX);
    expect(provider.sendText as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "+50688880000",
      "Te tardarías 8 meses.",
    );
  });
});
