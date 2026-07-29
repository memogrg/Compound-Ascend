import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ email: "davi@example.com" }) as { email?: string } | null),
  loadTodayChat: vi.fn(async () => [] as { role: "user" | "assistant"; content: string; createdAt: string }[]),
  sendEmail: vi.fn(async (_p: unknown) => ({ ok: true }) as { ok: boolean; skipped?: boolean }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true, getUser: () => h.getUser() }));
vi.mock("@/lib/ai/chat-store", () => ({
  loadTodayChat: () => h.loadTodayChat(),
  buildTranscriptText: (msgs: unknown[]) => `TRANSCRIPT(${msgs.length})`,
  startOfCostaRicaDayISO: () => "2026-07-29T06:00:00.000Z",
}));
vi.mock("@/lib/email/send", () => ({ sendEmail: (p: unknown) => h.sendEmail(p) }));
// Deps que importa actions.ts pero no se usan acá: mocks livianos.
vi.mock("@/modules/wealth", () => ({ createInvestmentAlert: async () => ({ ok: true }) }));
vi.mock("@/modules/control", () => ({ createGoal: async () => {}, goalInputSchema: { safeParse: () => ({ success: false }) } }));
vi.mock("@/modules/assistant/services/transaction-service", () => ({ createTransaction: async () => {} }));

import { emailTranscriptAction } from "@/modules/assistant/api/actions";

beforeEach(() => {
  h.getUser.mockResolvedValue({ email: "davi@example.com" });
  h.loadTodayChat.mockResolvedValue([]);
  h.sendEmail.mockClear();
  h.sendEmail.mockResolvedValue({ ok: true });
});

describe("emailTranscriptAction", () => {
  it("con conversación → manda el transcript al PROPIO correo del usuario", async () => {
    h.loadTodayChat.mockResolvedValue([
      { role: "user", content: "hola", createdAt: "2026-07-29T18:30:00Z" },
      { role: "assistant", content: "qué tal", createdAt: "2026-07-29T18:31:00Z" },
    ]);
    const res = await emailTranscriptAction();
    expect(res.ok).toBe(true);
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    const arg = h.sendEmail.mock.calls[0]![0] as { to: string; subject: string; html: string };
    expect(arg.to).toBe("davi@example.com"); // a sí mismo
    expect(arg.subject).toMatch(/My Agent C\+/);
    expect(arg.html).toContain("TRANSCRIPT(2)");
  });

  it("sin conversación del día → {ok:false} y NO envía correo", async () => {
    const res = await emailTranscriptAction();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/no hay conversación/i);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });

  it("sin correo de sesión → {ok:false} y NO envía", async () => {
    h.getUser.mockResolvedValue(null);
    h.loadTodayChat.mockResolvedValue([{ role: "user", content: "x", createdAt: "2026-07-29T18:30:00Z" }]);
    const res = await emailTranscriptAction();
    expect(res.ok).toBe(false);
    expect(h.sendEmail).not.toHaveBeenCalled();
  });
});
