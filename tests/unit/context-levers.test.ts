import { describe, it, expect } from "vitest";
import { debtLevers, goalLevers, monthsBetween, protectionLevers } from "@/lib/ai/context-levers";

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

describe("monthsBetween (timezone-safe, sobre ISO)", () => {
  it("meses enteros exactos", () => {
    expect(monthsBetween("2026-01-01", "2027-01-01")).toBe(12);
    expect(monthsBetween("2026-01-01", "2026-01-01")).toBe(0);
  });
  it("no cuenta el mes en curso hasta cumplir el día", () => {
    expect(monthsBetween("2026-01-15", "2026-04-10")).toBe(2); // 3 meses cal, pero 10<15 → 2
    expect(monthsBetween("2026-01-15", "2026-04-20")).toBe(3);
  });
  it("negativo si toISO ya pasó; NaN si es inválida", () => {
    expect(monthsBetween("2026-06-01", "2026-01-01")).toBe(-5);
    expect(Number.isNaN(monthsBetween("2026-06-01", "no-fecha"))).toBe(true);
  });
});

describe("goalLevers", () => {
  const g = (over: Partial<Parameters<typeof goalLevers>[0][number]> = {}) => ({
    name: "Meta",
    targetAmount: 1_200_000,
    currentAmount: 0,
    monthlyContribution: 50_000,
    targetDate: "2027-01-01" as string | null,
    currency: "CRC",
    ...over,
  });
  const TODAY = "2026-01-01"; // 12 meses a 2027-01-01

  it("monthlyRequired = ceil(gap / meses restantes); onTrack compara con el aporte", () => {
    const { goals } = goalLevers([g({ monthlyContribution: 50_000 })], TODAY);
    expect(goals[0]!.monthlyRequired).toBe(100_000); // 1.2M / 12
    expect(goals[0]!.onTrack).toBe(false); // 50k < 100k
    expect(goalLevers([g({ monthlyContribution: 120_000 })], TODAY).goals[0]!.onTrack).toBe(true);
  });
  it("sin targetDate → monthlyRequired y onTrack undefined (no hay ritmo objetivo)", () => {
    const { goals } = goalLevers([g({ targetDate: null })], TODAY);
    expect(goals[0]!.monthlyRequired).toBeUndefined();
    expect(goals[0]!.onTrack).toBeUndefined();
  });
  it("fecha vencida → vencida=true, monthlyRequired = todo el faltante", () => {
    const { goals } = goalLevers([g({ targetDate: "2025-06-01", currentAmount: 200_000 })], TODAY);
    expect(goals[0]!.vencida).toBe(true);
    expect(goals[0]!.monthlyRequired).toBe(1_000_000); // 1.2M − 200k
    expect(goals[0]!.onTrack).toBe(false);
  });
  it("filtra sobres (targetAmount ≤ 0) — no son palanca", () => {
    const { goals } = goalLevers(
      [g({ name: "Meta" }), g({ name: "Sobre", targetAmount: 0 })],
      TODAY,
    );
    expect(goals.map((x) => x.name)).toEqual(["Meta"]);
  });
  it("ordena por atraso (shortfall) desc", () => {
    const { goals } = goalLevers(
      [
        g({ name: "AlDia", monthlyContribution: 100_000 }), // req 100k, shortfall 0
        g({ name: "Atrasada", monthlyContribution: 10_000 }), // req 100k, shortfall 90k
      ],
      TODAY,
    );
    expect(goals.map((x) => x.name)).toEqual(["Atrasada", "AlDia"]);
  });
});

describe("protectionLevers", () => {
  it("mapea type/severity/description y DESCARTA recommendation (copy de UI)", () => {
    const gaps = [
      {
        type: "Seguro de invalidez",
        severity: "alto" as const,
        description: "vivís de tu ingreso",
        recommendation: "cotizá ya",
      },
    ];
    expect(protectionLevers(gaps)).toEqual([
      { type: "Seguro de invalidez", severity: "alto", description: "vivís de tu ingreso" },
    ]);
  });
});
