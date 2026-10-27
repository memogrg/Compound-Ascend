/**
 * Plan efectivo desde TS: `readEffectivePlan` es un envoltorio fino de la RPC `effective_plan`
 * (las reglas viven en SQL y se prueban en tests/rls/effective-plan.rls.test.ts). Acá se prueba
 * solo el contrato del envoltorio: pide el id dado, devuelve un Plan válido o `null` ante
 * cualquier duda, y `getEffectivePlan` convierte ese null en el default seguro 'ninguno'.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T>(fn: T) => fn };
});

type Respuesta = { data: unknown; error: { message: string } | null } | "lanza";
let respuesta: Respuesta = { data: "max", error: null };
const rpc = vi.fn(async (_fn: string, _args: unknown) => {
  if (respuesta === "lanza") throw new Error("red caída");
  return respuesta;
});

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc })),
}));

import { readEffectivePlan } from "@/lib/auth/effective-plan";
import { getEffectivePlan } from "@/lib/auth/feature-gate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

const client = { rpc } as unknown as SupabaseClient<Database>;

beforeEach(() => {
  respuesta = { data: "max", error: null };
  rpc.mockClear();
});

describe("readEffectivePlan", () => {
  it("llama a la RPC con el id pedido y devuelve el plan", async () => {
    expect(await readEffectivePlan(client, "user-9")).toBe("max");
    expect(rpc).toHaveBeenCalledWith("effective_plan", { p_user: "user-9" });
  });

  it("devuelve null si la RPC responde con error", async () => {
    respuesta = { data: null, error: { message: "boom" } };
    expect(await readEffectivePlan(client, "user-1")).toBeNull();
  });

  it("devuelve null si la RPC lanza", async () => {
    respuesta = "lanza";
    expect(await readEffectivePlan(client, "user-1")).toBeNull();
  });

  it("devuelve null sin perfil (la RPC da null) y ante un valor que no es un plan", async () => {
    respuesta = { data: null, error: null };
    expect(await readEffectivePlan(client, "user-1")).toBeNull();
    respuesta = { data: "premium", error: null };
    expect(await readEffectivePlan(client, "user-1")).toBeNull();
  });
});

describe("getEffectivePlan", () => {
  it("usa el usuario de la sesión", async () => {
    respuesta = { data: "pro", error: null };
    expect(await getEffectivePlan()).toBe("pro");
    expect(rpc).toHaveBeenCalledWith("effective_plan", { p_user: "user-1" });
  });

  it("si no se pudo saber, cae a 'ninguno'", async () => {
    respuesta = { data: null, error: { message: "boom" } };
    expect(await getEffectivePlan()).toBe("ninguno");
  });
});
