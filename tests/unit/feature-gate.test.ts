/**
 * Gating premium en servidor: la UI puede ocultar, pero la autorización real es
 * `assertFeature`. Free no entra a features premium; premium sí; ai_chat (común
 * a ambos) nunca bloquea.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let planValue: "free" | "premium" | null = "free";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: planValue === null ? null : { plan: planValue },
            error: null,
          }),
        }),
      }),
    }),
  })),
}));

import { assertFeature, getUserPlan } from "@/lib/auth/feature-gate";
import { AppError } from "@/lib/errors";

beforeEach(() => {
  planValue = "free";
});

describe("assertFeature (gating premium en servidor)", () => {
  it("free: bloquea una feature premium con 403", async () => {
    planValue = "free";
    await expect(assertFeature("expert_review")).rejects.toMatchObject({ status: 403 });
    await expect(assertFeature("expert_review")).rejects.toBeInstanceOf(AppError);
  });

  it("free: NO bloquea ai_chat (común a ambos planes)", async () => {
    planValue = "free";
    await expect(assertFeature("ai_chat")).resolves.toBeUndefined();
  });

  it("premium: permite la feature premium", async () => {
    planValue = "premium";
    await expect(assertFeature("expert_review")).resolves.toBeUndefined();
  });

  it("sin perfil: cae a 'free' (seguro) y bloquea premium", async () => {
    planValue = null;
    expect(await getUserPlan()).toBe("free");
    await expect(assertFeature("marketplace")).rejects.toMatchObject({ status: 403 });
  });
});
