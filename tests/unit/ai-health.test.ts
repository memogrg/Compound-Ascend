/**
 * /api/ai/health — verificación en runtime del modelo de chat. Contrato: PROTEGIDO
 * (CRON_SECRET, 401 sin él); con auth devuelve { model, ok, latencyMs, error } donde `model` es
 * el CHAT efectivo y `ok`/`error` reflejan si respondió (nunca falla en silencio).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const chatMock = vi.fn();
vi.mock("@/lib/ai/providers/gemini", () => ({
  CHAT_MODEL: "gemini-3.1-flash-lite",
  createGeminiProvider: () => ({ name: "gemini", model: "gemini-3.1-flash-lite", chat: chatMock }),
}));

import { GET } from "@/app/api/ai/health/route";

const URL = "http://localhost/api/ai/health";

beforeEach(() => {
  chatMock.mockReset();
  process.env.CRON_SECRET = "s3cr3t";
});

describe("GET /api/ai/health", () => {
  it("sin CRON_SECRET en el header → 401 (no público)", async () => {
    const res = await GET(new Request(URL));
    expect(res.status).toBe(401);
  });

  it("con auth y ping OK → { model, ok:true, latencyMs, error:null }", async () => {
    chatMock.mockResolvedValue({ text: "ok", tokensIn: 1, tokensOut: 1 });
    const res = await GET(new Request(URL, { headers: { authorization: "Bearer s3cr3t" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe("gemini-3.1-flash-lite");
    expect(body.ok).toBe(true);
    expect(body.error).toBeNull();
    expect(typeof body.latencyMs).toBe("number");
  });

  it("con auth pero el modelo falla (p. ej. 404) → ok:false + error (no silencia)", async () => {
    chatMock.mockRejectedValue(new Error("La IA rechazó la solicitud (configuración/modelo). (IA-400)"));
    const res = await GET(new Request(URL, { headers: { "x-cron-secret": "s3cr3t" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe("gemini-3.1-flash-lite");
    expect(body.ok).toBe(false);
    expect(body.error).toContain("IA-400");
  });
});
