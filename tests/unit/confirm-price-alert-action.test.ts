import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  createInvestmentAlert: vi.fn(async (_input: unknown) => ({ ok: true, id: "a1" }) as { ok: boolean; id?: string; message?: string }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/modules/wealth", () => ({ createInvestmentAlert: (input: unknown) => h.createInvestmentAlert(input) }));
// Otras deps que importa actions.ts (no se usan en este flujo): mocks livianos.
vi.mock("@/modules/control", () => ({ createGoal: async () => {}, goalInputSchema: { safeParse: () => ({ success: false }) } }));
vi.mock("@/modules/assistant/services/transaction-service", () => ({ createTransaction: async () => {} }));

import { confirmPriceAlertAction } from "@/modules/assistant/api/actions";

beforeEach(() => {
  h.createInvestmentAlert.mockClear();
  h.createInvestmentAlert.mockResolvedValue({ ok: true, id: "a1" });
});

describe("confirmPriceAlertAction", () => {
  it("input válido → crea la alerta vía createInvestmentAlert (kind price; dirección la infiere el server)", async () => {
    const res = await confirmPriceAlertAction({ symbol: "JUP", targetPrice: 1, assetType: "cripto", currency: "USD" });
    expect(res.ok).toBe(true);
    expect(h.createInvestmentAlert).toHaveBeenCalledTimes(1);
    const arg = h.createInvestmentAlert.mock.calls[0]![0] as { kind: string; symbol: string; targetPrice: number };
    expect(arg.kind).toBe("price");
    expect(arg.symbol).toBe("JUP");
    expect(arg.targetPrice).toBe(1);
  });

  it("input inválido (precio ≤0) → {ok:false} y NO crea", async () => {
    const res = await confirmPriceAlertAction({ symbol: "JUP", targetPrice: 0, assetType: "cripto", currency: "USD" });
    expect(res.ok).toBe(false);
    expect(h.createInvestmentAlert).not.toHaveBeenCalled();
  });

  it("el servicio rechaza (precio = actual / símbolo no cotizable) → propaga el mensaje", async () => {
    h.createInvestmentAlert.mockResolvedValue({ ok: false, message: "Elegí un precio distinto al actual." });
    const res = await confirmPriceAlertAction({ symbol: "JUP", targetPrice: 1, assetType: "cripto", currency: "USD" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/precio distinto/i);
  });
});
