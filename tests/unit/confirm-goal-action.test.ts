import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ createGoal: vi.fn(async (_input: unknown) => {}) }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/modules/control", async () => {
  // goalInputSchema real (zod puro); solo createGoal mockeado.
  const schemas = await vi.importActual<typeof import("@/modules/control/schemas")>(
    "@/modules/control/schemas",
  );
  return { createGoal: (input: unknown) => h.createGoal(input), goalInputSchema: schemas.goalInputSchema };
});
// createTransaction (importado por actions.ts) no se usa acá; mock liviano.
vi.mock("@/modules/assistant/services/transaction-service", () => ({ createTransaction: async () => {} }));

import { confirmGoalAction } from "@/modules/assistant/api/actions";

beforeEach(() => {
  h.createGoal.mockClear();
});

describe("confirmGoalAction", () => {
  it("input válido → crea la meta", async () => {
    const res = await confirmGoalAction({
      name: "Viaje",
      targetAmount: 50_000_000,
      monthlyContribution: 273_305,
      currency: "CRC",
      targetDate: "2036-07-01",
    });
    expect(res.ok).toBe(true);
    expect(h.createGoal).toHaveBeenCalledTimes(1);
    const arg = h.createGoal.mock.calls[0]![0] as { name: string; targetAmount: number };
    expect(arg.name).toBe("Viaje");
    expect(arg.targetAmount).toBe(50_000_000);
  });

  it("input inválido (sin name) → {ok:false} y NO crea", async () => {
    const res = await confirmGoalAction({ targetAmount: 100, currency: "CRC" });
    expect(res.ok).toBe(false);
    expect(h.createGoal).not.toHaveBeenCalled();
  });
});
