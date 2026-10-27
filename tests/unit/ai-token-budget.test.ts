/**
 * assertTokenBudget: el gate real de la IA (chat, recibos). Usa el plan EFECTIVO, consultado
 * con service-role por id: un miembro activo del hogar de un titular Max+ conversa aunque su
 * `profiles.plan` sea 'ninguno' (B-2), con su propio cupo (el ledger es por persona). Si el plan
 * no se puede saber cae a 'ninguno' → límite 0, el mismo default seguro de antes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true }));

const db = vi.hoisted(() => ({
  rpc: { data: "max", error: null } as { data: unknown; error: { message: string } | null },
  usados: 0,
  rpcCalls: [] as { fn: string; args: unknown }[],
  tablas: [] as string[],
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      db.rpcCalls.push({ fn, args });
      return db.rpc;
    },
    from: (tabla: string) => {
      db.tablas.push(tabla);
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { tokens_used: db.usados } }),
      };
      return q;
    },
  }),
}));

import { assertTokenBudget, PLAN_TOKEN_LIMITS } from "@/lib/ai/usage";

beforeEach(() => {
  db.rpc = { data: "max", error: null };
  db.usados = 0;
  db.rpcCalls = [];
  db.tablas = [];
});

describe("assertTokenBudget con el plan efectivo", () => {
  it("efectivo max (heredado del hogar) → pasa, consultado por id con service-role", async () => {
    await expect(assertTokenBudget("miembro-1")).resolves.toBeUndefined();
    expect(db.rpcCalls).toEqual([{ fn: "effective_plan", args: { p_user: "miembro-1" } }]);
    // El plan no se lee de profiles: solo el ledger va por tabla.
    expect(db.tablas).toEqual(["ai_usage_ledger"]);
  });

  it("el cupo es el del plan efectivo, por persona", async () => {
    db.usados = PLAN_TOKEN_LIMITS.max;
    await expect(assertTokenBudget("miembro-1")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringContaining("Alcanzaste"),
    });
  });

  it("efectivo ninguno → en pausa", async () => {
    db.rpc = { data: "ninguno", error: null };
    await expect(assertTokenBudget("u1")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringContaining("en pausa"),
    });
  });

  it("si la RPC falla → 'ninguno' (límite 0), no se regala IA", async () => {
    db.rpc = { data: null, error: { message: "boom" } };
    await expect(assertTokenBudget("u1")).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringContaining("en pausa"),
    });
  });
});
