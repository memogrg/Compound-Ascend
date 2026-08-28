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
// Cliente-spy COMPARTIDO: lo usan el cliente directo del context-engine (perfiles personales → .eq)
// Y resolveAuth (los servicios de dominio financieros → .in). Así seguimos capturando el
// .in(householdMemberIds) real aunque savings_goals/debts ahora se consulten dentro de listGoals/listDebts.
const makeSpyClient = vi.hoisted(() => () => ({
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
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => makeSpyClient(),
}));
// Paso 2 movió savings_goals/debts a los servicios de dominio (listGoals/listDebts), que resuelven
// su cliente vía resolveAuth. Lo apuntamos al MISMO spy para seguir aseverando el scoping por hogar
// END-TO-END (el .in(householdMemberIds) real que hace listGoals), no solo la delegación.
vi.mock("@/lib/auth/auth-context", () => ({
  resolveAuth: async () => ({ db: makeSpyClient(), userId: "A" }),
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
  it("hogar de 2 → savings_goals por .in vía listGoals (financiero compartido)", async () => {
    await buildFinancialContext();
    // Paso 2: las metas se consultan dentro de listGoals (household-scoped). resolveAuth apunta al
    // mismo spy, así seguimos verificando el .in(householdMemberIds) REAL sobre savings_goals —
    // el scoping por hogar sigue aseverado end-to-end, no solo la delegación.
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
