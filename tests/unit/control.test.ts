import { describe, it, expect } from "vitest";
import {
  orderDebts,
  simulateStrategy,
  recommendMethod,
  type DebtInput,
} from "@/modules/control/engine/debt-strategy";
import { buildControlDiagnosis } from "@/modules/control/engine/priority-engine";
import type { SavingsGoal, Debt } from "@/modules/control/types";

const debts: DebtInput[] = [
  { id: "a", name: "Tarjeta", balance: 1000, apr: 40, minPayment: 50 },
  { id: "b", name: "Préstamo", balance: 3000, apr: 12, minPayment: 100 },
  { id: "c", name: "Tiendita", balance: 400, apr: 25, minPayment: 30 },
];

describe("debt-strategy", () => {
  it("avalancha ordena por tasa desc", () => {
    expect(orderDebts(debts, "avalancha").map((d) => d.id)).toEqual(["a", "c", "b"]);
  });
  it("bola de nieve ordena por saldo asc", () => {
    expect(orderDebts(debts, "bola_nieve").map((d) => d.id)).toEqual(["c", "a", "b"]);
  });
  it("simula y paga toda la deuda en tiempo finito", () => {
    const sim = simulateStrategy(debts, "avalancha", 200);
    expect(sim.feasible).toBe(true);
    expect(sim.months).toBeGreaterThan(0);
    expect(sim.payoffOrder.length).toBe(3);
    expect(sim.totalInterest).toBeGreaterThan(0);
  });
  it("avalancha cuesta menos intereses que bola de nieve (en este caso)", () => {
    const av = simulateStrategy(debts, "avalancha", 200);
    const sn = simulateStrategy(debts, "bola_nieve", 200);
    expect(av.totalInterest).toBeLessThanOrEqual(sn.totalInterest);
  });
  it("recomienda híbrido/bola de nieve con alto estrés", () => {
    const r = recommendMethod(debts, { stress: 9, discipline: 3 });
    expect(["hibrido", "bola_nieve"]).toContain(r.method);
  });
});

function goal(p: Partial<SavingsGoal>): SavingsGoal {
  return {
    id: "g",
    name: "Meta",
    targetAmount: 1000,
    currentAmount: 0,
    monthlyContribution: 0,
    currency: "CRC",
    status: "revisar",
    recurrence: "ninguna",
    ...p,
  };
}
function debt(p: Partial<Debt>): Debt {
  return {
    id: "d",
    name: "Deuda",
    balance: 1000,
    minPayment: 50,
    currentPayment: 50,
    apr: 10,
    currency: "CRC",
    isCurrent: true,
    ...p,
  };
}

describe("priority-engine", () => {
  it("flujo negativo => semáforo rojo y pausa objetivos no esenciales", () => {
    const d = buildControlDiagnosis(
      [goal({ name: "Viaje", priority: "baja", monthlyContribution: 50 })],
      [],
      { freeCashflow: -100, hasEmergencyFund: false },
    );
    expect(d.semaforo).toBe("rojo");
    expect(d.goalRecs[0]!.action).toBe("pausar");
    expect(d.nextBestAction.toLowerCase()).toContain("recorta");
  });

  it("deuda cara => decisión prioriza la deuda", () => {
    const d = buildControlDiagnosis(
      [],
      [debt({ apr: 40, balance: 2000 })],
      { freeCashflow: 300, hasEmergencyFund: true },
    );
    expect(d.decision.toLowerCase()).toContain("deuda");
    expect(d.debtMethod).toBeDefined();
  });

  it("situación sana => score alto y verde", () => {
    const d = buildControlDiagnosis(
      [goal({ name: "Casa", priority: "alta", targetAmount: 1200, monthlyContribution: 200, targetDate: futureISO(6) })],
      [debt({ apr: 8, balance: 500 })],
      { freeCashflow: 500, hasEmergencyFund: true, stress: 3 },
    );
    expect(d.scoreControl).toBeGreaterThanOrEqual(75);
    expect(d.semaforo).toBe("verde");
  });
});

function futureISO(m: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + m);
  return d.toISOString().slice(0, 10);
}
