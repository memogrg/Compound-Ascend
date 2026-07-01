import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TxnInput } from "@/modules/financial-base/schemas";

// Integración: buildTransactionRow, sin regla que matchee, delega en resolveAutoCategory (cascada
// 3-3). Mockeamos resolveAutoCategory (su lógica se prueba en ai-categorize.test.ts) para verificar
// el WIRING: se llama con {supabase, merchant, kind} y su resultado define category_id.
const h = vi.hoisted(() => ({
  auto: vi.fn(async (_opts: unknown) => null as { categoryId: string; source: string } | null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => null }));
vi.mock("@/modules/financial-base/services/rules-service", () => ({
  findMatchingRule: async () => null, // ninguna regla matchea
}));
vi.mock("@/modules/financial-base/services/ai-categorize", () => ({
  resolveAutoCategory: (opts: unknown) => h.auto(opts),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        order: () => b,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(r, j),
      };
      return b;
    },
  }),
}));

import { buildTransactionRow } from "@/modules/financial-base/services/transaction-service";

const baseInput = (): TxnInput =>
  ({
    kind: "gasto",
    amount: 12000,
    currency: "CRC",
    occurredOn: "2026-07-01",
    merchantOrSource: "Starbucks",
    status: "confirmed",
    origin: "manual",
  }) as TxnInput;

beforeEach(() => {
  h.auto.mockReset();
});

describe("buildTransactionRow · auto-asignación (cascada 3-3)", () => {
  it("sin regla pero con SEÑAL FUERTE → nace categorizada", async () => {
    h.auto.mockResolvedValue({ categoryId: "c-comida", source: "historial" });
    const { row } = await buildTransactionRow(baseInput());
    expect(row.category_id).toBe("c-comida");
    // Se llamó con el comercio y kind, SIN userId (sesión → RLS).
    const arg = h.auto.mock.calls[0]![0] as { merchant: string; kind: string; userId?: string };
    expect(arg.merchant).toBe("Starbucks");
    expect(arg.kind).toBe("gasto");
    expect(arg.userId).toBeUndefined();
  });

  it("sin regla y sin señal fuerte → sigue null (Por clasificar)", async () => {
    h.auto.mockResolvedValue(null);
    const { row } = await buildTransactionRow(baseInput());
    expect(row.category_id).toBeNull();
    expect(h.auto).toHaveBeenCalledTimes(1);
  });

  it("si la categoría ya viene explícita, NO llama a auto-asignar", async () => {
    const input = { ...baseInput(), categoryId: "11111111-1111-4111-8111-111111111111" } as TxnInput;
    const { row } = await buildTransactionRow(input);
    expect(row.category_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(h.auto).not.toHaveBeenCalled();
  });
});
