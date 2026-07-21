import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * buildContextForUser (WhatsApp, service-role, sin sesión) debe armar un
 * FinancialContext RICO con paridad respecto a la web: no solo los 5 campos base,
 * sino también Número de Libertad, patrimonio neto e invertible cuando los
 * servicios devuelven datos. Y si el enriquecimiento falla, debe seguir
 * devolviendo al menos los 5 campos base.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/household/active", () => ({
  // Modo solo: householdMemberIds degrada a [userId], asi estos tests
  // conservan exactamente la semantica que tenian antes del alcance de hogar.
  householdMemberIds: async (_c: unknown, uid: string) => [uid],
  getActiveHouseholdId: async () => null,
  isActiveHouseholdEditor: async () => true,
}));

// Cliente service-role fake: chainable + thenable, devuelve filas por tabla.
type Res = { data: unknown[]; error: null };
function makeBuilder(rows: unknown[]) {
  const res: Res = { data: rows, error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    order: () => builder,
    or: () => Promise.resolve(res),
    limit: () => Promise.resolve(res),
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (
      onFulfilled?: ((v: Res) => unknown) | null,
      onRejected?: ((r: unknown) => unknown) | null,
    ) => Promise.resolve(res).then(onFulfilled ?? undefined, onRejected ?? undefined),
  };
  return builder;
}
let tableData: Record<string, unknown[]> = {};
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({ from: (table: string) => makeBuilder(tableData[table] ?? []) }),
}));

vi.mock("@/lib/whatsapp/links-service", () => ({
  getUserDisplayName: async () => "Memo",
  getUserCurrency: async () => "CRC",
}));

vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => ({ CRC: 1, USD: 500 }),
}));

const getPatrimonioReportForUser = vi.fn();
vi.mock("@/modules/wealth/services/patrimonio-service", () => ({
  getPatrimonioReportForUser: (...a: unknown[]) => getPatrimonioReportForUser(...a),
}));

const aggregateNetWorth = vi.fn();
vi.mock("@/modules/rich-life/services/rich-life-service", () => ({
  aggregateNetWorth: (...a: unknown[]) => aggregateNetWorth(...a),
}));

// Perfil mockeado a vacío: este test se centra en las métricas patrimoniales.
vi.mock("@/lib/whatsapp/wa-profile-context", () => ({
  readProfileContext: async () => ({}),
}));

import { buildContextForUser } from "@/lib/whatsapp/context-service";

const patrimonioReport = {
  currency: "CRC",
  level: { name: "Constructor" },
  report: {
    indice: 64,
    numeroDeIndependencia: 290_400_000,
    numeroDeLibertad: 350_000_000,
    añosDeLibertad: 11,
    mesesDeColchon: 8,
    coberturaPasiva: 0.34,
    calidadPatrimonio: 70,
    investableWealth: 13_000_000,
  },
  diagnosis: [{ code: "liquidez_baja" }],
};

const netWorthAggregate = {
  assets: [{ value: 90_000_000 }],
  liabilities: [{ balance: 30_000_000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  tableData = {
    income_sources: [{ amount_monthly_base: 1_000_000 }],
    expense_items: [{ amount_monthly_base: 400_000 }],
    savings_goals: [{ target_amount: 3_000_000, current_amount: 1_200_000 }],
    debts: [
      { id: "d1", name: "Tarjeta", balance: 500_000, apr: 45, min_payment: 25_000, currency: "CRC" },
      { id: "d2", name: "Préstamo", balance: 1_000_000, apr: 18, min_payment: 40_000, currency: "CRC" },
    ],
  };
  getPatrimonioReportForUser.mockResolvedValue(patrimonioReport);
  aggregateNetWorth.mockResolvedValue(netWorthAggregate);
});

describe("buildContextForUser · paridad de contexto en WhatsApp", () => {
  it("puebla Número de Libertad, patrimonio neto e invertible (además de los 5 base)", async () => {
    const ctx = await buildContextForUser("u1", null);

    // Métricas patrimoniales (la brecha que causaba 'no tengo acceso').
    expect(ctx.numeroDeIndependencia).toBe(290_400_000); // sostener la vida ACTUAL (al 8%)
    expect(ctx.numeroDeLibertad).toBe(350_000_000); // estilo de vida DESEADO (definido → presente)
    expect(ctx.investableWealth).toBe(13_000_000);
    expect(ctx.netWorth).toBe(60_000_000); // 90M activos − 30M pasivos
    expect(ctx.indicePatrimonial).toBe(64);
    expect(ctx.nivelPatrimonial).toBe("Constructor");
    expect(ctx.mesesDeColchon).toBe(8);
    expect(ctx.coberturaPasivaPct).toBe(34);
    expect(ctx.patrimonioDiagnosis).toEqual(["liquidez_baja"]);

    // Deudas y metas normalizadas.
    expect(ctx.debtCount).toBe(2);
    expect(ctx.debtTotal).toBe(1_500_000);
    expect(ctx.topDebtName).toBe("Tarjeta"); // la de mayor TAE (45%)
    expect(ctx.topDebtApr).toBe(45);
    expect(ctx.goalCount).toBe(1);
    expect(ctx.goalsProgressPct).toBeCloseTo(0.4, 5);

    // Campos base intactos.
    expect(ctx.currency).toBe("CRC");
    expect(ctx.name).toBe("Memo");
    expect(ctx.incomeMonthly).toBe(1_000_000);
    expect(ctx.expenseMonthly).toBe(400_000);
    expect(ctx.freeCashflow).toBe(600_000);
  });

  it("si el enriquecimiento patrimonial falla, sigue devolviendo los 5 campos base", async () => {
    getPatrimonioReportForUser.mockRejectedValue(new Error("boom"));
    aggregateNetWorth.mockRejectedValue(new Error("boom"));

    const ctx = await buildContextForUser("u1", null);

    // Base siempre presente.
    expect(ctx.currency).toBe("CRC");
    expect(ctx.name).toBe("Memo");
    expect(ctx.incomeMonthly).toBe(1_000_000);
    expect(ctx.expenseMonthly).toBe(400_000);
    expect(ctx.freeCashflow).toBe(600_000);
    // Sin métricas patrimoniales (no se inventan).
    expect(ctx.numeroDeLibertad).toBeUndefined();
    expect(ctx.netWorth).toBeUndefined();
    expect(ctx.investableWealth).toBeUndefined();
  });
});
