import { describe, it, expect } from "vitest";
import { debtLevers } from "@/lib/ai/context-levers";

const d = (over: Partial<Parameters<typeof debtLevers>[0][number]> = {}) => ({
  name: "Deuda",
  liveBalance: 100_000,
  apr: 20,
  minPayment: 5_000,
  currency: "CRC",
  ...over,
});

describe("debtLevers", () => {
  it("monthlyInterestCost = round(saldo × apr/100 / 12)", () => {
    const { debts } = debtLevers([d({ liveBalance: 800_000, apr: 40 })]);
    // 800000 × 0.40 / 12 = 26 666,67 → 26 667
    expect(debts[0]!.monthlyInterestCost).toBe(26_667);
  });
  it("apr null o 0 → interés 0 (no hay costo que atacar)", () => {
    expect(debtLevers([d({ apr: null })]).debts[0]!.monthlyInterestCost).toBe(0);
    expect(debtLevers([d({ apr: 0 })]).debts[0]!.monthlyInterestCost).toBe(0);
  });
  it("ordena por costo de interés desc", () => {
    const { debts } = debtLevers([
      d({ name: "A", liveBalance: 1_000_000, apr: 5 }), // interés ~4.167
      d({ name: "B", liveBalance: 300_000, apr: 40 }), // interés ~10.000
      d({ name: "C", liveBalance: 200_000, apr: 40 }), // interés ~6.667
    ]);
    expect(debts.map((x) => x.name)).toEqual(["B", "C", "A"]);
  });
  it("desempata por saldo cuando el interés es igual", () => {
    const { debts } = debtLevers([
      d({ name: "Chica", liveBalance: 240_000, apr: 40 }), // interés 8.000
      d({ name: "Grande", liveBalance: 480_000, apr: 20 }), // interés 8.000
    ]);
    expect(debts.map((x) => x.name)).toEqual(["Grande", "Chica"]); // mismo interés → mayor saldo primero
  });
  it("filtra deudas saldadas (≤0.5) — no son palanca", () => {
    const { debts } = debtLevers([
      d({ name: "Viva", liveBalance: 500 }),
      d({ name: "Saldada", liveBalance: 0 }),
    ]);
    expect(debts.map((x) => x.name)).toEqual(["Viva"]);
  });
  it("topN + moreCount", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      d({ name: `D${i}`, liveBalance: (i + 1) * 100_000, apr: 30 }),
    );
    const { debts, moreCount } = debtLevers(many, 6);
    expect(debts.length).toBe(6);
    expect(moreCount).toBe(2);
  });
  it("redondea saldo y mínimo; preserva moneda y apr", () => {
    const { debts } = debtLevers([
      d({ liveBalance: 100_000.7, minPayment: 4_999.4, currency: "USD", apr: 18 }),
    ]);
    expect(debts[0]).toMatchObject({
      liveBalance: 100_001,
      minPayment: 4_999,
      currency: "USD",
      apr: 18,
    });
  });
});
