import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * addDefenseSeguroAction (D1): crea la META DE AHORRO de la prima y, si vienen
 * datos de póliza, también la póliza vinculada. Sin datos → solo la meta
 * ("en progreso"). Si falla la meta tras crear la póliza → rollback de la póliza.
 */
const h = vi.hoisted(() => ({
  createPolicy: vi.fn(async (_input: unknown) => "pol-1"),
  deletePolicy: vi.fn(async (_id: string) => {}),
  createGoal: vi.fn(async (_input: Record<string, unknown>) => "goal-1"),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/logger", () => ({ logger: { error: () => {} } }));
vi.mock("@/modules/control/services/control-service", () => ({
  createGoal: (input: Record<string, unknown>) => h.createGoal(input),
}));
vi.mock("@/modules/wealth", () => ({
  createPolicy: (input: unknown) => h.createPolicy(input),
  deletePolicy: (id: string) => h.deletePolicy(id),
  addPolicyAction: async () => ({ ok: true }),
}));
vi.mock("@/modules/financial-base", () => ({
  listCategoryTree: async () => [],
  deleteTransaction: async () => {},
  createCategory: async () => null,
}));
vi.mock("@/modules/control/services/goal-detail-service", () => ({ getGoalDetail: async () => null }));

import { addDefenseSeguroAction } from "@/modules/control/api/actions";

beforeEach(() => {
  h.createPolicy.mockClear();
  h.deletePolicy.mockClear();
  h.createGoal.mockClear();
  h.createGoal.mockResolvedValue("goal-1");
});

describe("addDefenseSeguroAction", () => {
  it("con datos de póliza → crea póliza + meta vinculada (policy_id)", async () => {
    const res = await addDefenseSeguroAction({
      policyType: "gastos_mayores",
      coverage: 4200,
      premium: 350,
      currency: "USD",
      name: "Seguro gastos mayores",
      targetAmount: 4200,
      monthlyContribution: 350,
      recurrence: "mensual",
    });
    expect(res.ok).toBe(true);
    expect(h.createPolicy).toHaveBeenCalledTimes(1);
    const goal = h.createGoal.mock.calls[0]![0];
    expect(goal).toMatchObject({
      kind: "meta",
      goalType: "defensa:seguro_gastos_mayores",
      policyId: "pol-1",
      targetAmount: 4200,
      monthlyContribution: 350,
      recurrence: "mensual",
    });
  });

  it("sin datos de póliza → solo la meta (policy_id null, en progreso)", async () => {
    const res = await addDefenseSeguroAction({
      policyType: "vida",
      currency: "CRC",
      name: "Seguro de vida",
      monthlyContribution: 100,
      recurrence: "mensual",
    });
    expect(res.ok).toBe(true);
    expect(h.createPolicy).not.toHaveBeenCalled();
    expect(h.createGoal.mock.calls[0]![0]).toMatchObject({
      goalType: "defensa:seguro_vida",
      policyId: null,
    });
  });

  it("si falla la meta tras crear la póliza → rollback (borra la póliza)", async () => {
    h.createGoal.mockRejectedValueOnce(new Error("boom"));
    const res = await addDefenseSeguroAction({
      policyType: "gastos_mayores",
      premium: 350,
      currency: "USD",
      name: "Seguro",
    });
    expect(res.ok).toBe(false);
    expect(h.deletePolicy).toHaveBeenCalledWith("pol-1");
  });
});
