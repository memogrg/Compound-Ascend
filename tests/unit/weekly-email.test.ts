import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendEmail, getNotificationPrefs } = vi.hoisted(() => ({
  sendEmail: vi.fn(async (_p: { to: string; subject: string; html: string }) => ({ ok: true })),
  getNotificationPrefs: vi.fn(async () => ({
    email: true,
    whatsapp: true,
    push: true,
    inApp: true,
  })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ UNSUBSCRIBE_SECRET: "s" }) }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/email/send", () => ({ sendEmail }));
vi.mock("@/lib/notifications/preferences", () => ({ getNotificationPrefs }));
vi.mock("@/lib/notifications/unsubscribe-token", () => ({ signUnsubscribeToken: () => "tok" }));
vi.mock("@/lib/insights/insights-service", () => ({ runForUsersBestEffort: vi.fn() }));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "u@x.com" } } }) } },
  }),
}));
vi.mock("@/modules/wealth", () => ({
  getPatrimonioReportForUser: async () => ({ report: {}, level: {}, diagnosis: [], currency: "CRC" }),
  buildWeeklyDigest: () => ({ subject: "Asunto", html: "<p>BODY</p>", text: "BODY" }),
}));

import { sendWeeklyDigestForUser } from "@/lib/notifications/weekly-email";

const UID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  sendEmail.mockClear();
  getNotificationPrefs.mockReset();
  process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
});

describe("sendWeeklyDigestForUser · salvaguardas", () => {
  it("NO envía si la pref email está apagada", async () => {
    getNotificationPrefs.mockResolvedValue({ email: false, whatsapp: true, push: true, inApp: true });
    await sendWeeklyDigestForUser(UID);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("envía con footer de baja (token) cuando email ON y hay correo", async () => {
    getNotificationPrefs.mockResolvedValue({ email: true, whatsapp: true, push: true, inApp: true });
    await sendWeeklyDigestForUser(UID);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0]![0];
    expect(arg.to).toBe("u@x.com");
    expect(arg.subject).toBe("Asunto");
    expect(arg.html).toContain("https://app.test/api/notifications/unsubscribe?token=tok");
  });

  it("NO envía si falta la URL base (baja rota)", async () => {
    getNotificationPrefs.mockResolvedValue({ email: true, whatsapp: true, push: true, inApp: true });
    delete process.env.NEXT_PUBLIC_APP_URL;
    await sendWeeklyDigestForUser(UID);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
