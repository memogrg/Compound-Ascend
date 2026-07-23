import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * El sobre que el usuario confirma en la card (categoryId) debe llegar al pipeline central de
 * creación, NO null. Antes el servicio del asistente pasaba categoryId:null hardcodeado y el
 * gasto nunca aterrizaba en un sobre. Aquí espiamos createBaseTransaction para verificar el paso.
 */
const h = vi.hoisted(() => ({ createSpy: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/financial-base", () => ({
  createTransaction: (input: Record<string, unknown>) => {
    h.createSpy(input);
    return Promise.resolve({ id: "t1", linkedKind: "none", linkedId: null });
  },
  propagateLinkedTransaction: vi.fn(),
  deleteLinkedTransaction: vi.fn(),
}));

import { createTransaction } from "@/modules/assistant/services/transaction-service";

const base = {
  kind: "gasto" as const,
  description: "Starbucks",
  amount: 3500,
  currency: "CRC",
  occurredOn: "2026-06-01",
  source: "chat" as const,
};

beforeEach(() => h.createSpy.mockClear());

describe("assistant createTransaction · categoryId", () => {
  it("reenvía el sobre elegido al pipeline (no null)", async () => {
    await createTransaction({ ...base, categoryId: "8126a25b-0873-44a4-8321-53de492cfe4a" });
    expect(h.createSpy).toHaveBeenCalledTimes(1);
    const arg = h.createSpy.mock.calls[0]![0] as { categoryId: string | null };
    expect(arg.categoryId).toBe("8126a25b-0873-44a4-8321-53de492cfe4a");
  });

  it("sin sobre (Sin sobre) → categoryId null, deja auto-categorizar al pipeline", async () => {
    await createTransaction(base);
    const arg = h.createSpy.mock.calls[0]![0] as { categoryId: string | null };
    expect(arg.categoryId).toBeNull();
  });
});
