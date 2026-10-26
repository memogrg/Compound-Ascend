/**
 * GET /api/account/plan: lo que consulta el paywall nativo mientras espera el webhook.
 * Con sesión devuelve `{ plan }`; sin sesión, 401 (no un redirect a /login, que a un fetch le
 * serviría HTML).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sesion = vi.hoisted(() => ({ user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/auth/session", () => ({ getUser: async () => sesion.user }));

const db = vi.hoisted(() => ({
  fila: { plan: "pro" } as { plan: string } | null,
  error: null as { message: string } | null,
  pedidoId: null as unknown,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, val: unknown) => {
          db.pedidoId = val;
          return { maybeSingle: async () => ({ data: db.fila, error: db.error }) };
        },
      }),
    }),
  }),
}));

import { GET } from "@/app/api/account/plan/route";

beforeEach(() => {
  sesion.user = { id: "u1" };
  db.fila = { plan: "pro" };
  db.error = null;
  db.pedidoId = null;
});

describe("GET /api/account/plan", () => {
  it("devuelve el plan de la cuenta con sesión, sin caché", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: "pro" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(db.pedidoId).toBe("u1");
  });

  it("sin plan todavía → ninguno", async () => {
    db.fila = { plan: "ninguno" };
    expect(await (await GET()).json()).toEqual({ plan: "ninguno" });
  });

  it("sin fila de perfil → ninguno", async () => {
    db.fila = null;
    expect(await (await GET()).json()).toEqual({ plan: "ninguno" });
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
