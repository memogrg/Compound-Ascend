import { describe, it, expect, vi, beforeEach } from "vitest";

// Estado compartido por el fake del cliente Supabase (vía resolveAuth mockeado).
const h = vi.hoisted(() => ({
  rows: [] as { role: string; content: string }[],
  insertSpy: vi.fn(),
  insertError: null as { message: string } | null,
  throwOnFrom: false,
  gteArg: "" as string,
  eqCalls: [] as [string, unknown][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/auth-context", () => {
  const makeDb = () => ({
    from: () => {
      if (h.throwOnFrom) throw new Error("db down");
      const b: Record<string, unknown> = {
        select: () => b,
        gte: (_col: string, val: string) => {
          h.gteArg = val;
          return b;
        },
        eq: (col: string, val: unknown) => {
          h.eqCalls.push([col, val]);
          return b;
        },
        order: () => b,
        limit: () => Promise.resolve({ data: h.rows, error: null }),
        insert: (rows: unknown) => {
          h.insertSpy(rows);
          return Promise.resolve({ error: h.insertError });
        },
      };
      return b;
    },
  });
  // resolveAuth: ignora el ctx real (usa el fake db) pero devuelve userId estable.
  return { resolveAuth: async () => ({ db: makeDb(), userId: "u1" }) };
});

import { loadRecentTurns, appendTurns } from "@/lib/ai/conversation-store";
import type { AuthContext } from "@/lib/auth/auth-context";

const FAKE_CTX = {} as AuthContext; // truthy → activa el filtro .eq(user_id) en loadRecentTurns

beforeEach(() => {
  h.rows = [];
  h.insertSpy.mockClear();
  h.insertError = null;
  h.throwOnFrom = false;
  h.gteArg = "";
  h.eqCalls = [];
});

describe("conversation-store · loadRecentTurns", () => {
  it("mapea a ChatMessage y ordena cronológico (DESC de la DB → viejo→nuevo)", async () => {
    // La DB devuelve DESC (más reciente primero); loadRecentTurns lo invierte.
    h.rows = [
      { role: "assistant", content: "B" },
      { role: "user", content: "A" },
    ];
    const res = await loadRecentTurns();
    expect(res).toEqual([
      { role: "user", content: "A" },
      { role: "assistant", content: "B" },
    ]);
  });

  it("respeta la ventana de tiempo (filtra por created_at >= hace ~120 min)", async () => {
    await loadRecentTurns();
    const since = new Date(h.gteArg).getTime();
    const expected = Date.now() - 120 * 60_000;
    expect(Math.abs(since - expected)).toBeLessThan(5_000); // ~2h atrás, con holgura
  });

  it("con ctx inyectado (service-role) filtra explícito por user_id", async () => {
    await loadRecentTurns(FAKE_CTX);
    expect(h.eqCalls).toContainEqual(["user_id", "u1"]);
  });

  it("sin ctx (sesión) NO agrega filtro explícito (confía en RLS)", async () => {
    await loadRecentTurns();
    expect(h.eqCalls).toEqual([]);
  });

  it("ante error devuelve [] (best-effort)", async () => {
    h.throwOnFrom = true;
    expect(await loadRecentTurns()).toEqual([]);
  });
});

describe("conversation-store · appendTurns", () => {
  it("inserta filas con user_id/channel/role/content", async () => {
    await appendTurns(undefined, [
      { role: "user", content: "hola", channel: "web" },
      { role: "assistant", content: "buenas", channel: "web" },
    ]);
    const rows = h.insertSpy.mock.calls[0]![0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ user_id: "u1", channel: "web", role: "user", content: "hola" });
    expect(rows[1]).toEqual({ user_id: "u1", channel: "web", role: "assistant", content: "buenas" });
  });

  it("lista vacía → no inserta", async () => {
    await appendTurns(undefined, []);
    expect(h.insertSpy).not.toHaveBeenCalled();
  });

  it("nunca lanza: si el insert falla, resuelve igual (best-effort)", async () => {
    h.insertError = { message: "boom" };
    await expect(
      appendTurns(undefined, [{ role: "user", content: "x", channel: "whatsapp" }]),
    ).resolves.toBeUndefined();
  });

  it("nunca lanza: si el cliente falla, resuelve igual", async () => {
    h.throwOnFrom = true;
    await expect(
      appendTurns(undefined, [{ role: "user", content: "x", channel: "whatsapp" }]),
    ).resolves.toBeUndefined();
  });
});
