/**
 * Contrato de "responder a un mensaje pasado" en POST /api/assistant/chat:
 *  1. Sin cita, el turno se arma exactamente como antes.
 *  2. Con cita fuera de la ventana reciente, el par citado entra IGUAL al contexto — que es
 *     todo el punto: el asesor tiene que saber a qué se refiere aunque sea de hace días.
 *  3. Si el citado sigue dentro de la ventana no se duplica.
 *  4. Citar NO toma el atajo determinista (ese carril ignora el historial a propósito).
 *  5. Si la retención ya borró el citado, se avisa y NO se escribe la FK (rompería el insert).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const financeChatWithToolsMock = vi.fn(async (_msgs: unknown, _ctx?: unknown, _tools?: unknown) => ({
  reply: "respuesta",
  action: null,
  lane: "reasoning",
  provider: "stub",
  tokensIn: 10,
  tokensOut: 5,
}));
const resolveDeterministicMock = vi.fn(async () => ({
  reply: "determinista",
  action: null,
  lane: "template",
  provider: "router",
  tokensIn: 0,
  tokensOut: 0,
}));
vi.mock("@/lib/ai/orchestrator", () => ({
  financeChatWithTools: (m: unknown, c: unknown, t: unknown) => financeChatWithToolsMock(m, c, t),
  resolveDeterministic: () => resolveDeterministicMock(),
  normalizeDebtsForTool: () => [],
}));

let matchIntentResult: unknown = null;
vi.mock("@/lib/ai/router", () => ({ matchIntent: () => matchIntentResult }));
vi.mock("@/lib/ai/lazy-context", () => ({
  scopeForIntent: () => ({ context: null, tool: {} }),
}));
vi.mock("@/lib/ai/context-engine", () => ({ buildFinancialContext: vi.fn(async () => ({})) }));
vi.mock("@/lib/ai/usage", () => ({
  assertTokenBudget: vi.fn(async () => undefined),
  recordUsage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ai/events", () => ({ recordAiEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/session", () => ({
  getUser: vi.fn(async () => ({ id: "user-1" })),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 9 })),
  RATE_LIMITS: { aiChat: { limit: 20, windowMs: 60_000 } },
  clientIp: () => "1.1.1.1",
}));
vi.mock("@/lib/security/cors", () => ({
  assertTrustedOrigin: () => true,
  corsHeaders: () => ({}),
}));
vi.mock("@/server/observability/alerts", () => ({ alert: vi.fn() }));
vi.mock("@/modules/financial-base", () => ({ getDisplayCurrency: vi.fn(async () => "CRC") }));
vi.mock("@/modules/control", () => ({ listDebts: vi.fn(async () => []), listGoals: vi.fn(async () => []) }));
vi.mock("@/modules/wealth/services/patrimonio-service", () => ({
  getPatrimonioReport: vi.fn(async () => {
    throw new Error("no");
  }),
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: vi.fn(async () => null) }));

const VIEJO = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "assistant" as const,
  content: "Gastaste ₡320.000 en comida este mes.",
  createdAt: "2026-08-01T10:00:00Z",
  replyToId: null,
};
const VIEJO_PAR = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "user" as const,
  content: "¿cuánto gasté en comida?",
  createdAt: "2026-08-01T10:00:00Z",
  replyToId: null,
};

let ventana: typeof VIEJO[] = [];
let citaResuelta: { quoted: typeof VIEJO; partner: typeof VIEJO_PAR | null } | null = null;
const appendMock = vi.fn(async (_ctx: unknown, _msgs: unknown) => ["new-user-id", "new-bot-id"]);
vi.mock("@/lib/ai/chat-store", () => ({
  loadRetainedChat: async () => ventana,
  loadQuotedContext: async () => citaResuelta,
  appendChatMessages: (ctx: unknown, msgs: unknown) => appendMock(ctx, msgs),
}));

import { POST } from "@/app/api/assistant/chat/route";

type Turno = { role: string; content: string };

function pedir(body: Record<string, unknown>) {
  return new Request("http://localhost/api/assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Los mensajes con los que se llamó al modelo en la última corrida. */
function ultimosMensajes(): Turno[] {
  return financeChatWithToolsMock.mock.calls.at(-1)?.[0] as unknown as Turno[];
}

beforeEach(() => {
  financeChatWithToolsMock.mockClear();
  resolveDeterministicMock.mockClear();
  appendMock.mockClear();
  matchIntentResult = null;
  ventana = [];
  citaResuelta = null;
});

describe("sin cita · el turno se arma como siempre", () => {
  it("no agrega nada al contexto ni escribe reply_to_message_id", async () => {
    const res = await POST(pedir({ message: "hola" }));
    expect(res.status).toBe(200);
    expect(ultimosMensajes()).toEqual([{ role: "user", content: "hola" }]);
    const filas = appendMock.mock.calls[0]?.[1] as { replyToMessageId?: string | null }[];
    expect(filas[0]?.replyToMessageId).toBeNull();
  });

  it("devuelve los ids del turno para que la UI pueda citarlo enseguida", async () => {
    const json = (await (await POST(pedir({ message: "hola" }))).json()) as {
      messageIds: { user: string; assistant: string };
    };
    expect(json.messageIds).toEqual({ user: "new-user-id", assistant: "new-bot-id" });
  });
});

describe("con cita · el mensaje citado llega al modelo", () => {
  beforeEach(() => {
    citaResuelta = { quoted: VIEJO, partner: VIEJO_PAR };
  });

  it("fuera de la ventana reciente, el par citado entra igual", async () => {
    ventana = []; // el hilo reciente no lo tiene: es de hace días
    await POST(pedir({ message: "¿y el mes pasado?", replyToMessageId: VIEJO.id }));
    const msgs = ultimosMensajes();
    const textos = msgs.map((m) => m.content).join("\n");
    expect(textos).toContain("Gastaste ₡320.000 en comida este mes.");
    expect(textos).toContain("¿cuánto gasté en comida?"); // la respuesta asociada, también
  });

  it("el turno del usuario va ANOTADO para que el modelo sepa a qué se refiere", async () => {
    await POST(pedir({ message: "¿y el mes pasado?", replyToMessageId: VIEJO.id }));
    const ultimo = ultimosMensajes().at(-1)!;
    expect(ultimo.role).toBe("user");
    expect(ultimo.content).toContain("RESPONDIENDO");
    expect(ultimo.content.trimEnd().endsWith("¿y el mes pasado?")).toBe(true);
  });

  it("lo que se PERSISTE es el mensaje crudo, no el anotado", async () => {
    await POST(pedir({ message: "¿y el mes pasado?", replyToMessageId: VIEJO.id }));
    const filas = appendMock.mock.calls[0]?.[1] as { content: string; replyToMessageId?: string }[];
    expect(filas[0]?.content).toBe("¿y el mes pasado?");
    expect(filas[0]?.replyToMessageId).toBe(VIEJO.id);
  });

  it("si el citado sigue en la ventana no se duplica", async () => {
    ventana = [VIEJO_PAR as unknown as typeof VIEJO, VIEJO];
    await POST(pedir({ message: "¿y el mes pasado?", replyToMessageId: VIEJO.id }));
    const apariciones = ultimosMensajes().filter((m) => m.content === VIEJO.content).length;
    expect(apariciones).toBe(1);
  });

  it("NO toma el atajo determinista aunque el texto matchee un intent", async () => {
    matchIntentResult = { intent: "gasto_categoria", params: {} };
    await POST(pedir({ message: "¿y el mes pasado?", replyToMessageId: VIEJO.id }));
    expect(resolveDeterministicMock).not.toHaveBeenCalled();
    expect(financeChatWithToolsMock).toHaveBeenCalled();
  });
});

describe("cita perdida por retención · degrada con aviso", () => {
  it("avisa y NO escribe la FK (un id fantasma rompería el insert del turno)", async () => {
    citaResuelta = null; // ya lo borró el cron
    const res = await POST(
      pedir({ message: "¿y el mes pasado?", replyToMessageId: VIEJO.id }),
    );
    const json = (await res.json()) as { quoteMissing?: boolean };
    expect(json.quoteMissing).toBe(true);
    const filas = appendMock.mock.calls[0]?.[1] as { replyToMessageId?: string | null }[];
    expect(filas[0]?.replyToMessageId).toBeNull();
  });

  it("igual responde: perder la cita no puede costarle el turno al usuario", async () => {
    citaResuelta = null;
    const res = await POST(pedir({ message: "¿y el mes pasado?", replyToMessageId: VIEJO.id }));
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("respuesta");
  });
});
