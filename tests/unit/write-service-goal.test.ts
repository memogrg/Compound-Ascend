import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ insertSpy: vi.fn(), insertError: null as { message: string } | null }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        h.insertSpy(row);
        return Promise.resolve({ error: h.insertError });
      },
    }),
  }),
}));

import { createGoalForUser } from "@/lib/whatsapp/write-service";

const GOAL = {
  type: "goal" as const,
  name: "Viaje familiar",
  targetAmount: 50_000_000,
  monthlyContribution: 273_305,
  currency: "CRC",
  targetDate: "2036-07-01",
};

beforeEach(() => {
  h.insertSpy.mockClear();
  h.insertError = null;
});

describe("createGoalForUser (service-role)", () => {
  it("inserta savings_goals con user_id/household_id, current_amount 0 y status 'revisar'", async () => {
    const res = await createGoalForUser("u1", "h1", GOAL);
    expect(res).toEqual({ ok: true });
    const row = h.insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(row).toMatchObject({
      user_id: "u1",
      household_id: "h1",
      name: "Viaje familiar",
      target_amount: 50_000_000,
      current_amount: 0,
      monthly_contribution: 273_305,
      currency: "CRC",
      target_date: "2036-07-01",
      status: "revisar",
    });
  });

  it("sin targetDate → target_date null", async () => {
    await createGoalForUser("u1", null, { ...GOAL, targetDate: null });
    const row = h.insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.target_date).toBeNull();
    expect(row.household_id).toBeNull();
  });

  it("error de DB → {ok:false, error}", async () => {
    h.insertError = { message: "boom" };
    const res = await createGoalForUser("u1", "h1", GOAL);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("boom");
  });
});
