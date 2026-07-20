/**
 * E4: el contexto de la IA ve las FINANZAS del hogar pero el PERFIL de quien
 * pregunta. Regla de oro: la plata es compartida, la persona no.
 *  - savings_goals (financiero) → .in(householdMemberIds)
 *  - risk/behavior/knowledge/personal_profiles, user_settings/priorities → .eq(user)
 *  - householdShared=true cuando el hogar tiene >1 miembro.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "A", user_metadata: { display_name: "David" } }),
  isSupabaseConfigured: () => true,
}));

// Hogar de dos: A (quien pregunta) + B.
const h = vi.hoisted(() => ({ members: ["A", "B"] as string[] }));
vi.mock("@/lib/household/active", () => ({
  householdMemberIds: async () => h.members,
}));

// Registra, por tabla, qué filtro de user_id se aplicó ('in' financiero vs 'eq' personal).
const filterByTable = vi.hoisted(() => ({}) as Record<string, string>);
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (col: string) => {
          if (col === "user_id") filterByTable[table] = "eq";
          return q;
        },
        in: (col: string) => {
          if (col === "user_id") filterByTable[table] = "in";
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: (v: { data: null; error: null }) => void) =>
          resolve({ data: null, error: null }),
      };
      return q;
    },
  }),
}));

// Servicios de dominio: no-op (ya household-scoped y probados aparte).
vi.mock("@/modules/financial-base/services/base-service", () => ({
  getBaseSummary: async () => ({ indicators: {} }),
  getPrimaryCurrency: async () => "CRC",
  getDisplayCurrency: async () => "CRC",
}));

import { buildFinancialContext } from "@/lib/ai/context-engine";

beforeEach(() => {
  for (const k of Object.keys(filterByTable)) delete filterByTable[k];
  h.members = ["A", "B"];
});

describe("buildFinancialContext · alcance de hogar (E4)", () => {
  it("hogar de 2 → savings_goals por .in (financiero compartido)", async () => {
    await buildFinancialContext();
    expect(filterByTable["savings_goals"]).toBe("in");
  }, 20000);

  it("los perfiles PERSONALES siguen por .eq(user), nunca .in", async () => {
    await buildFinancialContext();
    for (const t of [
      "personal_profiles",
      "risk_profiles",
      "behavior_profiles",
      "knowledge_profiles",
      "user_settings",
      "user_priorities",
    ]) {
      if (filterByTable[t] !== undefined) expect(filterByTable[t]).toBe("eq");
    }
  }, 20000);

  it("hogar de 2 → householdShared=true", async () => {
    const ctx = await buildFinancialContext();
    expect(ctx.householdShared).toBe(true);
  }, 20000);

  it("modo solo (1 miembro) → householdShared NO se marca (comportamiento intacto)", async () => {
    h.members = ["A"];
    const ctx = await buildFinancialContext();
    expect(ctx.householdShared).toBeUndefined();
  }, 20000);
});
