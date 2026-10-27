/**
 * GET /api/account/plan: lo que consulta el paywall nativo mientras espera el webhook.
 * Con sesión devuelve `{ plan }`; sin sesión, 401 (no un redirect a /login, que a un fetch le
 * serviría HTML). El plan es el EFECTIVO (RPC `effective_plan`), la misma fuente que el muro del
 * layout móvil.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sesion = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => sesion.user }));

const db = vi.hoisted(() => ({
  plan: "pro" as string | null,
  error: null as { message: string } | null,
  llamada: null as unknown,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    rpc: async (fn: string, args: unknown) => {
      db.llamada = { fn, args };
      return { data: db.error ? null : db.plan, error: db.error };
    },
  }),
}));

import { GET } from "@/app/api/account/plan/route";

beforeEach(() => {
  sesion.user = { id: "u1" };
  db.plan = "pro";
  db.error = null;
  db.llamada = null;
});

describe("GET /api/account/plan", () => {
  it("devuelve el plan de la cuenta con sesión, sin caché", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: "pro" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(db.llamada).toEqual({ fn: "effective_plan", args: { p_user: "u1" } });
  });

  it("sin plan todavía → ninguno", async () => {
    db.plan = "ninguno";
    expect(await (await GET()).json()).toEqual({ plan: "ninguno" });
  });

  it("miembro del hogar de un titular Max+ → max (el plan efectivo, no el propio)", async () => {
    db.plan = "max";
    expect(await (await GET()).json()).toEqual({ plan: "max" });
  });

  it("sin fila de perfil (RPC null) → 500, y el paywall vuelve a preguntar", async () => {
    db.plan = null;
    expect((await GET()).status).toBe(500);
  });

  it("sin sesión → 401", async () => {
    sesion.user = null;
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("si la lectura falla → 500 sin filtrar el detalle", async () => {
    db.error = { message: "boom interno" };
    const res = await GET();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("boom interno");
  });
});
