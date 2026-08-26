/**
 * Integración SIN Gemini y SIN Supabase real: mockea las 3 fuentes por-entidad
 * (getCurrentDebtBalances / listGoals / getPatrimonioReport) y verifica que
 * buildFinancialContext puebla ctx.debts / ctx.goals / ctx.protectionGaps con los
 * derivados correctos (interés mensual, ritmo requerido, brechas). Los demás bloques
 * son best-effort: sin sus mocks, sus try/catch los saltan y el contexto sigue.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "u1", user_metadata: {} }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/household/active", () => ({ householdMemberIds: async () => ["u1"] }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));

vi.mock("@/modules/control/services/debts-service", () => ({
  getCurrentDebtBalances: async () => [
    {
      id: "d1",
      name: "Tarjeta Oro",
      currentBalance: 800_000,
      currency: "CRC",
      apr: 40,
      minPayment: 30_000,
    },
    {
      id: "d2",
      name: "Préstamo",
      currentBalance: 500_000,
      currency: "CRC",
      apr: 18,
      minPayment: 25_000,
    },
  ],
}));
vi.mock("@/modules/control/services/control-service", () => ({
  listGoals: async () => [
    {
      name: "Viaje",
      targetAmount: 1_200_000,
      currentAmount: 0,
      monthlyContribution: 50_000,
      targetDate: "2027-01-01",
      currency: "CRC",
    },
    {
      name: "Sobre X",
      targetAmount: 0,
      currentAmount: 10_000,
      monthlyContribution: 0,
      targetDate: null,
      currency: "CRC",
    },
  ],
}));
vi.mock("@/lib/time/user-time", () => ({ userToday: async () => "2026-01-01" }));
vi.mock("@/modules/wealth", () => ({
  getPatrimonioReport: async () => ({
    report: {
      indice: 50,
      numeroDeSeguridad: 1_000_000,
      numeroDeIndependencia: 2_000_000,
      numeroDeLibertad: null,
      investableWealth: 500_000,
    },
    level: { name: "En construcción" },
    commitmentBreakdown: null,
    protectionGaps: [
      {
        type: "Seguro de invalidez",
        severity: "alto",
        description: "vivís de tu ingreso",
        recommendation: "x",
      },
      {
        type: "Seguro de vida",
        severity: "alto",
        description: "hay dependientes",
        recommendation: "y",
      },
    ],
    activePolicies: 1,
    currency: "CRC",
  }),
}));

import { buildFinancialContext } from "@/lib/ai/context-engine";

describe("buildFinancialContext · palancas por-entidad", () => {
  it("puebla ctx.debts (interés/mes, orden por interés) + ctx.goals (ritmo) + ctx.protectionGaps", async () => {
    const ctx = await buildFinancialContext({ patrimonio: true });

    // Deudas: ambas vivas, ordenadas por costo de interés (Tarjeta 40% primero).
    expect(ctx.debts?.map((d) => d.name)).toEqual(["Tarjeta Oro", "Préstamo"]);
    expect(ctx.debts?.[0]).toMatchObject({
      name: "Tarjeta Oro",
      liveBalance: 800_000,
      apr: 40,
      minPayment: 30_000,
      monthlyInterestCost: 26_667, // 800k × 0.40 / 12
    });

    // Metas: solo la que tiene objetivo (el sobre se filtra); ritmo requerido a 12 meses.
    expect(ctx.goals?.map((g) => g.name)).toEqual(["Viaje"]);
    expect(ctx.goals?.[0]).toMatchObject({
      target: 1_200_000,
      monthlyActual: 50_000,
      monthlyRequired: 100_000,
      onTrack: false,
    });

    // Protección: las brechas del engine, sin la recommendation (copy de UI).
    expect(ctx.protectionGaps?.map((g) => g.type)).toEqual([
      "Seguro de invalidez",
      "Seguro de vida",
    ]);
    expect(ctx.protectionGaps?.[0]).not.toHaveProperty("recommendation");
    expect(ctx.activePolicies).toBe(1);
  });
});
