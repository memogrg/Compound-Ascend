import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Delta C · getGoalDetail: clasifica los movimientos vinculados del frasco
 * (aporte +, gasto −, retiro −), calcula el saldo corrido y lo ancla para
 * terminar en current_amount (con fila de saldo inicial si hubo apertura).
 */
const h = vi.hoisted(() => ({
  goalRow: null as Record<string, unknown> | null,
  txns: [] as Record<string, unknown>[],
  resets: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));
vi.mock("@/modules/financial-base", () => ({
  getCategoryNameMap: async () => ({ c1: "Ropa" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (table: string) => {
      const rows = table === "goal_period_resets" ? h.resets : h.txns;
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        maybeSingle: () => Promise.resolve({ data: h.goalRow, error: null }),
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(r, j),
      };
      return b;
    },
  }),
}));

import { getGoalDetail } from "@/modules/control/services/goal-detail-service";

beforeEach(() => {
  h.goalRow = null;
  h.txns = [];
  h.resets = [];
});

describe("getGoalDetail · trazabilidad del frasco", () => {
  it("clasifica aporte/gasto y el saldo corrido cierra en el acumulado", async () => {
    h.goalRow = {
      id: "g1",
      name: "Ropa",
      currency: "CRC",
      current_amount: 180000,
      target_amount: 980000,
    };
    h.txns = [
      {
        id: "t-aporte",
        kind: "gasto",
        amount: 200000,
        currency: "CRC",
        occurred_on: "2026-07-01",
        category_id: null,
        description: "Aporte — Ropa",
        counts_in_budget: true,
      },
      {
        id: "t-gasto",
        kind: "gasto",
        amount: 20000,
        currency: "CRC",
        occurred_on: "2026-07-10",
        category_id: "c1",
        description: "Gasto — Ropa · camisa",
        counts_in_budget: false,
      },
    ];

    const vm = (await getGoalDetail("g1"))!;
    expect(vm.gap).toBe(800000); // 980k − 180k
    expect(vm.movements).toHaveLength(2); // sin saldo inicial (apertura 0)

    const [aporte, gasto] = vm.movements;
    expect(aporte!.type).toBe("aporte");
    expect(aporte!.amount).toBe(200000);
    expect(aporte!.balance).toBe(200000);
    expect(aporte!.offBudget).toBe(false);
    expect(aporte!.categoryLabel).toBeNull();

    expect(gasto!.type).toBe("gasto");
    expect(gasto!.amount).toBe(-20000);
    expect(gasto!.balance).toBe(180000); // cierra en el acumulado
    expect(gasto!.offBudget).toBe(true);
    expect(gasto!.categoryLabel).toBe("Ropa");
    expect(gasto!.note).toBe("camisa");
  });

  it("un retiro (ingreso vinculado) resta del acumulado", async () => {
    h.goalRow = {
      id: "g1",
      name: "Viaje",
      currency: "CRC",
      current_amount: 150000,
      target_amount: 300000,
    };
    h.txns = [
      {
        id: "t-aporte",
        kind: "gasto",
        amount: 200000,
        currency: "CRC",
        occurred_on: "2026-07-01",
        category_id: null,
        description: "Aporte — Viaje",
        counts_in_budget: true,
      },
      {
        id: "t-retiro",
        kind: "ingreso",
        amount: 50000,
        currency: "CRC",
        occurred_on: "2026-07-05",
        category_id: null,
        description: "Retiro — Viaje · imprevisto",
        counts_in_budget: true,
      },
    ];
    const vm = (await getGoalDetail("g1"))!;
    const retiro = vm.movements.find((m) => m.type === "retiro")!;
    expect(retiro.amount).toBe(-50000);
    expect(retiro.note).toBe("imprevisto");
    expect(vm.movements[vm.movements.length - 1]!.balance).toBe(150000);
  });

  it("saldo de apertura: crea la fila 'inicial' cuando la meta nació con acumulado", async () => {
    h.goalRow = {
      id: "g1",
      name: "Marchamo",
      currency: "CRC",
      current_amount: 250000,
      target_amount: 250000,
    };
    h.txns = [
      {
        id: "t-aporte",
        kind: "gasto",
        amount: 200000,
        currency: "CRC",
        occurred_on: "2026-07-01",
        category_id: null,
        description: "Aporte — Marchamo",
        counts_in_budget: true,
      },
    ];
    const vm = (await getGoalDetail("g1"))!;
    // net = +200k; apertura = 250k − 200k = 50k → primera fila 'inicial'.
    expect(vm.movements[0]!.type).toBe("inicial");
    expect(vm.movements[0]!.amount).toBe(50000);
    expect(vm.movements[0]!.balance).toBe(50000);
    expect(vm.movements[vm.movements.length - 1]!.balance).toBe(250000);
  });

  it("intercala los reinicios de período como eventos neutros para el saldo", async () => {
    h.goalRow = {
      id: "g1",
      name: "Marchamo",
      currency: "CRC",
      current_amount: 180000,
      target_amount: 980000,
    };
    h.txns = [
      {
        id: "t-aporte",
        kind: "gasto",
        amount: 200000,
        currency: "CRC",
        occurred_on: "2026-07-01",
        category_id: null,
        description: "Aporte — Marchamo",
        counts_in_budget: true,
      },
      {
        id: "t-gasto",
        kind: "gasto",
        amount: 20000,
        currency: "CRC",
        occurred_on: "2026-07-20",
        category_id: null,
        description: "Gasto — Marchamo",
        counts_in_budget: false,
      },
    ];
    h.resets = [{ id: "r1", reset_on: "2026-07-10", restored_target: 1000000 }];

    const vm = (await getGoalDetail("g1"))!;
    const reinicio = vm.movements.find((m) => m.type === "reinicio")!;
    expect(reinicio.amount).toBe(0);
    expect(reinicio.restoredTarget).toBe(1000000);
    expect(reinicio.locked).toBe(true);
    // Orden por fecha: aporte(01) → reinicio(10) → gasto(20); saldo cierra en 180k.
    expect(vm.movements.map((m) => m.type)).toEqual(["aporte", "reinicio", "gasto"]);
    expect(vm.movements[vm.movements.length - 1]!.balance).toBe(180000);
  });

  it("meta inexistente → null", async () => {
    h.goalRow = null;
    expect(await getGoalDetail("nope")).toBeNull();
  });
});
