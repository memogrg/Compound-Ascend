/**
 * Muro web de suscripción (middleware): decide con el plan EFECTIVO, no con el propio. Un
 * miembro activo del hogar de un titular Max+ no paga y aun así entra (B-2). Si el plan no se
 * puede saber (RPC caída, sin perfil todavía) el muro deja pasar, igual que antes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  rpc: { data: "max", error: null } as { data: unknown; error: { message: string } | null },
  llamadas: [] as { fn: string; args: unknown }[],
  from: 0,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: estado.user } }) },
    rpc: async (fn: string, args: unknown) => {
      estado.llamadas.push({ fn, args });
      return estado.rpc;
    },
    from: () => {
      estado.from += 1;
      throw new Error("el muro no debe leer tablas directo");
    },
  }),
}));

import { updateSession } from "@/lib/supabase/middleware";

function pedir(path: string) {
  return updateSession(new NextRequest(`http://localhost${path}`));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  estado.user = { id: "u1" };
  estado.rpc = { data: "max", error: null };
  estado.llamadas = [];
  estado.from = 0;
});

describe("muro web con el plan efectivo", () => {
  it("plan propio ninguno pero efectivo max (hogar) → entra", async () => {
    const res = await pedir("/dashboard");
    expect(res.headers.get("location")).toBeNull();
    expect(estado.llamadas).toEqual([{ fn: "effective_plan", args: { p_user: "u1" } }]);
    expect(estado.from).toBe(0);
  });

  it("efectivo ninguno → /empezar?reanudar=1", async () => {
    estado.rpc = { data: "ninguno", error: null };
    const res = await pedir("/dashboard");
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/empezar");
    expect(loc.search).toBe("?reanudar=1");
  });

  it("si la RPC falla → deja pasar (un muro caído no encierra)", async () => {
    estado.rpc = { data: null, error: { message: "boom" } };
    const res = await pedir("/dashboard");
    expect(res.headers.get("location")).toBeNull();
  });

  it("sin perfil todavía (RPC null) → deja pasar", async () => {
    estado.rpc = { data: null, error: null };
    const res = await pedir("/gastos");
    expect(res.headers.get("location")).toBeNull();
  });

  it("rutas públicas, /api y las permitidas sin plan no consultan el plan", async () => {
    estado.rpc = { data: "ninguno", error: null };
    for (const p of ["/", "/api/account/plan", "/m/gastos", "/configuracion", "/suscripcion"]) {
      const res = await pedir(p);
      expect(res.headers.get("location"), p).toBeNull();
    }
    expect(estado.llamadas).toHaveLength(0);
  });
});
