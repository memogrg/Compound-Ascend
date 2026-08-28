import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * #90 · sub-bug A — la fecha del gasto propuesto por WhatsApp sale de la zona del usuario
 * (userToday(authCtx) → perfil vía service-role), NUNCA del reloj UTC del server. Antes se usaba
 * `todayIso()` (UTC): a la noche en zonas negativas el gasto quedaba fechado +1 día.
 */

const { financeChatWithTools, cap } = vi.hoisted(() => ({
  financeChatWithTools: vi.fn(async (..._a: unknown[]) => ({
    reply: "Listo.",
    action: {
      type: "create_transaction",
      payload: { kind: "gasto", amount: 12000, currency: "CRC", description: "Super" },
      summary: "Gasto de ₡12.000",
    },
    tokensIn: 1,
    tokensOut: 1,
    provider: "stub",
  })),
  cap: { action: null as Record<string, unknown> | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/orchestrator", () => ({
  financeChatWithTools: (...a: unknown[]) => financeChatWithTools(...a),
  scanReceipt: vi.fn(),
}));
// userToday con la zona del PERFIL (webhook sin cookie): fijo a un día pasado para distinguirlo del
// UTC-hoy real. Si alguien regresa a todayIso()/new Date(), occurredOn dejaría de ser este valor.
vi.mock("@/lib/time/user-time", () => ({ userToday: async () => "2026-08-28" }));
vi.mock("@/lib/whatsapp/tool-context", () => ({ buildWhatsAppToolContext: async () => undefined }));
vi.mock("@/lib/whatsapp/context-service", () => ({
  buildContextForUser: async () => ({ currency: "CRC" }),
}));
vi.mock("@/lib/ai/usage", () => ({
  assertTokenBudget: async () => {},
  recordUsage: async () => {},
}));
vi.mock("@/lib/ai/conversation-store", () => ({
  loadRecentTurns: async () => [],
  appendTurns: async () => {},
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
  setPendingAction: async (_id: string, action: Record<string, unknown>) => {
    cap.action = action;
  },
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
  cap.action = null;
});

describe("WhatsApp · fecha del gasto en la zona del usuario (#90)", () => {
  it("create_transaction → occurredOn = userToday(perfil), no el reloj UTC del server", async () => {
    await routeInbound(fakeProvider(), {
      phone: "+50688880000",
      body: "gasté 12000 en super",
      numMedia: 0,
      mediaUrl: null,
      mediaType: null,
    });

    expect(cap.action).not.toBeNull();
    expect(cap.action!.occurredOn).toBe("2026-08-28");
    expect(cap.action!.amount).toBe(12000);
  });
});
