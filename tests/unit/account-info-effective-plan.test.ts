/**
 * getAccountInfo con el plan EFECTIVO (B-2): la pantalla de cuenta muestra el plan con el que la
 * persona usa la app (el propio o el heredado del hogar) y el medidor de IA usa su límite, el
 * mismo que aplica assertTokenBudget. El plan PROPIO sigue disponible para la suscripción.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  propio: "ninguno" as string,
  efectivo: "ninguno" as string,
}));

vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
  getUser: async () => ({ id: "u1", email: "u1@example.com", user_metadata: {} }),
  requireUser: async () => ({ id: "u1" }),
}));
vi.mock("@/lib/auth/feature-gate", () => ({ getEffectivePlan: async () => db.efectivo }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (tabla: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data:
            tabla === "profiles"
              ? { plan: db.propio, display_name: "Ana" }
              : tabla === "ai_usage_ledger"
                ? { tokens_used: 10 }
                : { primary_currency: "USD", notifications: null },
        }),
      };
      return q;
    },
  }),
}));

import { getAccountInfo, textoPlanHeredado } from "@/modules/account/services/account-service";
import { aiTokenLimit } from "@/lib/plan";

beforeEach(() => {
  db.propio = "ninguno";
  db.efectivo = "ninguno";
});

describe("getAccountInfo · plan efectivo", () => {
  it("miembro que hereda Max+: planEfectivo max, heredadoDe, límite de IA de max, plan propio intacto", async () => {
    db.efectivo = "max";
    const acc = await getAccountInfo();
    expect(acc.plan).toBe("ninguno");
    expect(acc.planEfectivo).toBe("max");
    expect(acc.heredadoDe).toEqual({ titular: null });
    expect(acc.tokenLimit).toBe(aiTokenLimit("max"));
  });

  it("titular Max+: planEfectivo = propio, sin heredadoDe", async () => {
    db.propio = "max";
    db.efectivo = "max";
    const acc = await getAccountInfo();
    expect(acc.plan).toBe("max");
    expect(acc.planEfectivo).toBe("max");
    expect(acc.heredadoDe).toBeNull();
    expect(acc.tokenLimit).toBe(aiTokenLimit("max"));
  });

  it("si la RPC falla (getEffectivePlan → ninguno) se muestra el propio, no se baja", async () => {
    db.propio = "pro";
    db.efectivo = "ninguno";
    const acc = await getAccountInfo();
    expect(acc.planEfectivo).toBe("pro");
    expect(acc.heredadoDe).toBeNull();
    expect(acc.tokenLimit).toBe(aiTokenLimit("pro"));
  });
});

describe("textoPlanHeredado", () => {
  it("con nombre del titular → «Incluido en el hogar de X»", () => {
    expect(textoPlanHeredado({ titular: "José" })).toBe("Incluido en el hogar de José");
  });
  it("sin nombre → «Incluido en tu hogar»", () => {
    expect(textoPlanHeredado({ titular: null })).toBe("Incluido en tu hogar");
  });
});
