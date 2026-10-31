/**
 * Gating por plan en servidor: la UI puede ocultar, pero la autorización real
 * es `assertFeature`. Sin plan no entra a nada; Esencial+ conversa pero no llega
 * a lo de Pro+; Max+ tiene todo. Sin fila de perfil se cae a 'ninguno', que es
 * el default SEGURO: ante la duda, no se regala acceso.
 *
 * El plan que se evalúa es el EFECTIVO (RPC `effective_plan`): un miembro activo
 * del hogar de un titular Max+ tiene lo de Max+ aunque su `profiles.plan` sea
 * 'ninguno' (B-2).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T>(fn: T) => fn };
});

let planValue: "ninguno" | "esencial" | "pro" | "max" | null = "esencial";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));

let rpcError: { message: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    // La RPC devuelve el plan efectivo; null sin fila de perfil.
    rpc: async () => ({ data: rpcError ? null : planValue, error: rpcError }),
    from: () => {
      throw new Error("el gate no debe leer profiles.plan directo");
    },
  })),
}));

import { assertFeature, getUserPlan } from "@/lib/auth/feature-gate";
import { AppError } from "@/lib/errors";

beforeEach(() => {
  planValue = "esencial";
  rpcError = null;
});

describe("assertFeature (gating por plan en servidor)", () => {
  it("Esencial+: bloquea con 403 lo que no incluye", async () => {
    planValue = "esencial";
    await expect(assertFeature("expert_review")).rejects.toMatchObject({ status: 403 });
    await expect(assertFeature("expert_review")).rejects.toBeInstanceOf(AppError);
  });

  it("Esencial+: NO bloquea ai_chat, que está en todos los planes de pago", async () => {
    planValue = "esencial";
    await expect(assertFeature("ai_chat")).resolves.toBeUndefined();
  });

  it("Pro+: la foto del recibo y el correo entran acá, no antes", async () => {
    planValue = "pro";
    await expect(assertFeature("receipt_scanner")).resolves.toBeUndefined();
    await expect(assertFeature("email_ingest")).resolves.toBeUndefined();
    // El hogar sigue siendo de Max+: es lo que hace que bajar deje huérfanos.
    await expect(assertFeature("household")).rejects.toMatchObject({ status: 403 });
  });

  it("Max+: permite todo", async () => {
    planValue = "max";
    await expect(assertFeature("expert_review")).resolves.toBeUndefined();
    await expect(assertFeature("household")).resolves.toBeUndefined();
  });

  it("sin suscripción: ni siquiera el chat", async () => {
    planValue = "ninguno";
    await expect(assertFeature("ai_chat")).rejects.toMatchObject({ status: 403 });
  });

  it("miembro del hogar de un titular Max+ (efectivo max): entra a lo de Max+", async () => {
    planValue = "max";
    expect(await getUserPlan()).toBe("max");
    await expect(assertFeature("household")).resolves.toBeUndefined();
  });

  it("si la RPC falla: cae a 'ninguno' (seguro) y bloquea", async () => {
    rpcError = { message: "boom" };
    expect(await getUserPlan()).toBe("ninguno");
    await expect(assertFeature("ai_chat")).rejects.toMatchObject({ status: 403 });
  });

  it("sin perfil: cae a 'ninguno' (seguro) y bloquea", async () => {
    planValue = null;
    expect(await getUserPlan()).toBe("ninguno");
    await expect(assertFeature("marketplace")).rejects.toMatchObject({ status: 403 });
  });
});
