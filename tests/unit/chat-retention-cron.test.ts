/**
 * Contrato del cron de retención del chat (/api/assistant/chat-retention):
 *  1. Sin secret (o con uno equivocado) NO borra nada — el borrado es irreversible.
 *  2. Con el secret correcto purga y reporta cuántas filas borró + los días de retención.
 *  3. Es idempotente: correrlo dos veces no cambia el resultado (el corte es por fecha).
 *  4. Extrae la MEMORIA de hechos ANTES de purgar — es el único momento en que la conversación del
 *     día ya está cerrada y todavía existe — y, sobre todo, la purga corre IGUAL si eso falla:
 *     la retención es una promesa al usuario y no puede quedar rehén de una llamada al LLM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
}));

const purgeMock = vi.fn(async () => 12);
vi.mock("@/lib/ai/chat-store", () => ({
  purgeExpiredChatMessages: () => purgeMock(),
}));

const SIN_HECHOS = { usuarios: 0, extraidos: 0, dedupeados: 0, archivados: 0, fallidos: 0 };
const extractMock = vi.fn(async () => SIN_HECHOS);
vi.mock("@/lib/ai/memory-extraction", () => ({
  extractMemoryForAllUsers: () => extractMock(),
}));

import { GET, POST } from "@/app/api/assistant/chat-retention/route";
import { CHAT_RETENTION_DAYS } from "@/lib/ai/chat-retention";

const SECRET = "test-cron-secret";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/assistant/chat-retention", { headers });
}

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  purgeMock.mockClear();
  extractMock.mockClear();
  extractMock.mockResolvedValue(SIN_HECHOS);
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("GET/POST /api/assistant/chat-retention", () => {
  it("sin secret no borra nada", async () => {
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(purgeMock).not.toHaveBeenCalled();
    // Ni aprende: un request no autorizado no puede disparar una llamada al LLM por cada usuario.
    expect(extractMock).not.toHaveBeenCalled();
  });

  it("con secret equivocado tampoco borra", async () => {
    const res = await GET(req({ "x-cron-secret": "malo" }));
    expect(res.status).toBe(403);
    expect(purgeMock).not.toHaveBeenCalled();
  });

  it("con X-Cron-Secret purga y reporta los días de retención vigentes", async () => {
    const res = await GET(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      retentionDays: number;
      deleted: number;
      memoria: unknown;
    };
    expect(json).toEqual({
      ok: true,
      retentionDays: CHAT_RETENTION_DAYS,
      deleted: 12,
      memoria: SIN_HECHOS,
    });
    expect(purgeMock).toHaveBeenCalledTimes(1);
  });

  it("acepta el Authorization: Bearer que manda Vercel Cron", async () => {
    const res = await POST(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(purgeMock).toHaveBeenCalledTimes(1);
  });

  it("aprende ANTES de purgar: si extrajera después, la conversación ya no existiría", async () => {
    const orden: string[] = [];
    extractMock.mockImplementationOnce(async () => {
      orden.push("extraer");
      return SIN_HECHOS;
    });
    purgeMock.mockImplementationOnce(async () => {
      orden.push("purgar");
      return 12;
    });
    await GET(req({ "x-cron-secret": SECRET }));
    expect(orden).toEqual(["extraer", "purgar"]);
  });

  it("si la extracción FALLA, la purga corre igual (la retención no queda rehén del LLM)", async () => {
    extractMock.mockRejectedValueOnce(new Error("gemini caído"));
    const res = await GET(req({ "x-cron-secret": SECRET }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deleted: number; memoria: unknown };
    expect(purgeMock).toHaveBeenCalledTimes(1);
    expect(json.deleted).toBe(12);
    expect(json.memoria).toBeNull();
  });

  it("es idempotente: la segunda corrida no encuentra nada más que borrar", async () => {
    purgeMock.mockResolvedValueOnce(12).mockResolvedValueOnce(0);
    const primera = (await (await GET(req({ "x-cron-secret": SECRET }))).json()) as {
      deleted: number;
    };
    const segunda = (await (await GET(req({ "x-cron-secret": SECRET }))).json()) as {
      deleted: number;
    };
    expect(primera.deleted).toBe(12);
    expect(segunda.deleted).toBe(0);
  });
});
