/**
 * recordUsage: el registro de consumo de IA server-side. Cubre los DOS caminos:
 *  - RPC atómico disponible (increment_ai_usage): se llama y NO se toca el read-modify-write.
 *  - RPC ausente (migración no aplicada): cae al read-modify-write clásico y lo registra,
 *    para que el despliegue sea seguro en cualquier orden.
 * El test de que el RPC suma EXACTO bajo concurrencia vive en tests/rls (contra Supabase real).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ logger: { warn: (...a: unknown[]) => warn(...a), error: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true }));

type RpcResult = { error: null | { code?: string; message: string } };
let rpcResult: RpcResult = { error: null };
let existingRow: { tokens_used: number; requests: number } | null = null;
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const upserts: Record<string, unknown>[] = [];

function fakeDb() {
  return {
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpcResult);
    },
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: existingRow }),
        upsert: (row: Record<string, unknown>) => {
          upserts.push({ ...row, __table: table });
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => fakeDb() }));

import { recordUsage } from "@/lib/ai/usage";

beforeEach(() => {
  rpcResult = { error: null };
  existingRow = null;
  rpcCalls.length = 0;
  upserts.length = 0;
  warn.mockClear();
});

describe("recordUsage · camino RPC atómico", () => {
  it("llama a increment_ai_usage con la suma y NO usa read-modify-write", async () => {
    await recordUsage("u1", 100, 50);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.name).toBe("increment_ai_usage");
    expect(rpcCalls[0]!.args).toMatchObject({ p_user_id: "u1", p_tokens: 150, p_requests: 1 });
    expect(rpcCalls[0]!.args.p_period).toMatch(/^\d{4}-\d{2}-01$/);
    expect(upserts).toHaveLength(0); // no cayó al fallback
    expect(warn).not.toHaveBeenCalled();
  });

  it("no escribe nada si el total redondea a 0", async () => {
    await recordUsage("u1", 0, 0);
    expect(rpcCalls).toHaveLength(0);
    expect(upserts).toHaveLength(0);
  });
});

describe("recordUsage · fallback read-modify-write", () => {
  it("si el RPC no existe (PGRST202), suma sobre lo existente y lo registra", async () => {
    rpcResult = { error: { code: "PGRST202", message: "Could not find the function" } };
    existingRow = { tokens_used: 200, requests: 3 };
    await recordUsage("u1", 100, 50);

    expect(rpcCalls).toHaveLength(1); // se intentó el RPC primero
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      __table: "ai_usage_ledger",
      user_id: "u1",
      tokens_used: 350, // 200 + 150
      requests: 4, // 3 + 1
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("desde cero (sin fila previa) el fallback inserta la suma limpia", async () => {
    rpcResult = { error: { code: "42883", message: "function does not exist" } };
    existingRow = null;
    await recordUsage("u2", 10, 5);
    expect(upserts[0]).toMatchObject({ user_id: "u2", tokens_used: 15, requests: 1 });
  });
});
