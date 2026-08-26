import { describe, it, expect } from "vitest";
import { buildSystemPrompt, type FinancialContext } from "@/lib/ai/system-prompt";

const base: FinancialContext = { currency: "CRC" };

describe("buildSystemPrompt · ladder de deuda (hecho neutral)", () => {
  it("renderiza saldo vivo, APR, mínimo y el interés mensual por deuda", () => {
    const out = buildSystemPrompt({
      ...base,
      debts: [
        {
          name: "Tarjeta Oro",
          liveBalance: 800_000,
          apr: 40,
          minPayment: 30_000,
          currency: "CRC",
          monthlyInterestCost: 26_667,
        },
      ],
    });
    expect(out).toContain("Tarjeta Oro");
    expect(out).toContain("saldo 800000 CRC @40%");
    expect(out).toContain("mínimo 30000 CRC");
    expect(out).toContain("interés ~26667 CRC/mes");
  });
  it("marca el '+N más' cuando hay debtsMoreCount", () => {
    const out = buildSystemPrompt({
      ...base,
      debts: [
        {
          name: "D",
          liveBalance: 100_000,
          apr: 10,
          minPayment: 5_000,
          currency: "CRC",
          monthlyInterestCost: 833,
        },
      ],
      debtsMoreCount: 3,
    });
    expect(out).toContain("+3 más");
  });
  it("sin debts no agrega el bloque", () => {
    expect(buildSystemPrompt(base)).not.toContain("saldo vivo, APR, mínimo");
  });
});
