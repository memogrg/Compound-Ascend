import { describe, it, expect, vi, beforeEach } from "vitest";

// Router: la IA propone create_goal → botones + pending goal; "Sí" con goal pending → crea la meta
// (no la transacción). El camino de transacción sigue funcionando. Orchestrator + write-service
// mockeados. (toGoalAction se ejercita por el camino de propuesta.)
const h = vi.hoisted(() => ({
  action: null as unknown,
  pending: null as unknown,
  createGoal: vi.fn((_userId: string, _hh: string | null, _goal: unknown) =>
    Promise.resolve({ ok: true }),
  ),
  createTxn: vi.fn((_userId: string, _hh: string | null, _action: unknown) =>
    Promise.resolve({ ok: true, categoryName: null }),
  ),
  setPending: vi.fn((_id: string, _action: unknown) => Promise.resolve()),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai/orchestrator", () => ({
  financeChatWithTools: async () => ({
    reply: "Listo.",
    action: h.action,
    tokensIn: 1,
    tokensOut: 1,
    provider: "stub",
  }),
  scanReceipt: vi.fn(),
}));
vi.mock("@/lib/whatsapp/tool-context", () => ({
  buildWhatsAppToolContext: async () => ({ currency: "CRC", fxUnavailable: false, debts: [] }),
}));
vi.mock("@/lib/whatsapp/context-service", () => ({
  buildContextForUser: async () => ({ currency: "CRC" }),
}));
vi.mock("@/lib/ai/usage", () => ({ assertTokenBudget: async () => {}, recordUsage: async () => {} }));
vi.mock("@/lib/ingestion/sources", () => ({ parseNotification: () => [] }));
vi.mock("@/lib/whatsapp/write-service", () => ({
  createGoalForUser: (u: string, hh: string | null, g: unknown) => h.createGoal(u, hh, g),
  createTransactionForUser: (u: string, hh: string | null, a: unknown) => h.createTxn(u, hh, a),
}));
vi.mock("@/lib/whatsapp/links-service", () => ({
  getActiveLinkByPhone: async () => ({ id: "l1", userId: "u1", householdId: "h1", phone: "+50688880000" }),
  getPendingAction: async () => h.pending,
  setPendingAction: (id: string, action: unknown) => h.setPending(id, action),
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

const send = (provider: WhatsAppProvider, body: string) =>
  routeInbound(provider, { phone: "+50688880000", body, numMedia: 0, mediaUrl: null, mediaType: null });

const GOAL_PENDING = {
  type: "goal",
  name: "Viaje familiar",
  targetAmount: 50_000_000,
  monthlyContribution: 273_305,
  currency: "CRC",
  targetDate: null,
};

beforeEach(() => {
  h.action = null;
  h.pending = null;
  h.createGoal.mockClear();
  h.createTxn.mockClear();
  h.setPending.mockClear();
});

describe("router · create_goal (WhatsApp)", () => {
  it("la IA propone create_goal → botones Sí/Editar + pending goal", async () => {
    h.action = {
      type: "create_goal",
      payload: { name: "Viaje familiar", targetAmount: 50_000_000, monthlyContribution: 273_305, currency: "CRC" },
    };
    const provider = fakeProvider();
    await send(provider, "quiero ahorrar para un viaje");

    const buttons = provider.sendButtons as ReturnType<typeof vi.fn>;
    expect(buttons).toHaveBeenCalledTimes(1);
    expect(buttons.mock.calls[0]![1]).toContain('Viaje familiar');
    // Se guardó un pending de tipo goal.
    const stored = h.setPending.mock.calls.at(-1)![1] as { type?: string };
    expect(stored.type).toBe("goal");
    expect(h.createGoal).not.toHaveBeenCalled(); // solo propone, no crea
  });

  it('"Sí" con goal pending → crea la meta (no la transacción)', async () => {
    h.pending = GOAL_PENDING;
    const provider = fakeProvider();
    await send(provider, "sí");

    expect(h.createGoal).toHaveBeenCalledTimes(1);
    expect(h.createGoal.mock.calls[0]).toEqual(["u1", "h1", GOAL_PENDING]);
    expect(h.createTxn).not.toHaveBeenCalled();
    expect(provider.sendText as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "+50688880000",
      expect.stringContaining("Meta creada"),
    );
  });

  it("la transacción sigue funcionando: 'Sí' con txn pending → crea transacción", async () => {
    h.pending = {
      kind: "gasto",
      description: "Café",
      amount: 5000,
      currency: "CRC",
      occurredOn: "2026-07-01",
      origin: "ai_assisted",
      source: "chat",
    };
    const provider = fakeProvider();
    await send(provider, "sí");

    expect(h.createTxn).toHaveBeenCalledTimes(1);
    expect(h.createGoal).not.toHaveBeenCalled();
  });
});
