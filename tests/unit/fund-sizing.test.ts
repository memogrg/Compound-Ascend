import { describe, it, expect } from "vitest";
import {
  sizeFund,
  computeDefenseFunds,
  emergencyTargetIn,
  isDefenseFundGoalType,
  EMERGENCY_FUND_USD,
  FUND_HORIZON_MONTHS,
} from "@/modules/wealth/engine/fund-sizing";

const RATES = { USD: 1, CRC: 510 };

describe("fund-sizing · engine puro", () => {
  it("emergencyTarget: $1.000 en la moneda principal", () => {
    expect(EMERGENCY_FUND_USD).toBe(1000);
    expect(emergencyTargetIn("USD", RATES)).toBe(1000);
    expect(emergencyTargetIn("CRC", RATES)).toBe(510000); // 1000 × 510
  });

  it("peaceTarget = N × gasto esencial", () => {
    const plan = computeDefenseFunds({
      emergencyTarget: 1000,
      emergencyCurrent: 1000, // cubierto → paz desbloqueada
      peaceMonths: 4,
      essentialMonthly: 2500,
      peaceCurrent: 0,
    });
    expect(plan.peace.target).toBe(10000); // 4 × 2500
    expect(plan.peace.months).toBe(4);
  });

  it("la brecha nunca es negativa (acumulado > objetivo)", () => {
    const f = sizeFund(1000, 1500, 12);
    expect(f.gap).toBe(0);
    expect(f.covered).toBe(true);
    expect(f.progressPct).toBe(1); // topeado
    expect(f.recommendedMonthly).toBe(0);
  });

  it("recommendedMonthly = brecha / horizonte", () => {
    const f = sizeFund(1000, 400, 12);
    expect(f.gap).toBe(600);
    expect(f.recommendedMonthly).toBe(50); // 600 / 12
    expect(f.progressPct).toBeCloseTo(0.4);
    expect(FUND_HORIZON_MONTHS).toBe(12);
  });

  it("EMERGENCIA primero: mientras no esté cubierta, no se recomienda aportar a paz", () => {
    const plan = computeDefenseFunds({
      emergencyTarget: 1000,
      emergencyCurrent: 200, // NO cubierto
      peaceMonths: 3,
      essentialMonthly: 2000,
      peaceCurrent: 0,
    });
    expect(plan.emergency.covered).toBe(false);
    expect(plan.emergency.recommendedMonthly).toBeGreaterThan(0);
    // La paz tiene objetivo/brecha calculados, pero su recomendación mensual está bloqueada.
    expect(plan.peace.target).toBe(6000);
    expect(plan.peace.blockedByEmergency).toBe(true);
    expect(plan.peace.recommendedMonthly).toBe(0);
    expect(plan.activeFund).toBe("emergency");
  });

  it("hito activeFund: emergency → peace → done", () => {
    expect(
      computeDefenseFunds({ emergencyTarget: 1000, emergencyCurrent: 0, peaceMonths: 3, essentialMonthly: 1000, peaceCurrent: 0 }).activeFund,
    ).toBe("emergency");
    expect(
      computeDefenseFunds({ emergencyTarget: 1000, emergencyCurrent: 1000, peaceMonths: 3, essentialMonthly: 1000, peaceCurrent: 500 }).activeFund,
    ).toBe("peace");
    expect(
      computeDefenseFunds({ emergencyTarget: 1000, emergencyCurrent: 1000, peaceMonths: 3, essentialMonthly: 1000, peaceCurrent: 3000 }).activeFund,
    ).toBe("done");
  });

  it("peaceMonths se acota a 3-6", () => {
    expect(computeDefenseFunds({ emergencyTarget: 0, emergencyCurrent: 0, peaceMonths: 1, essentialMonthly: 100, peaceCurrent: 0 }).peace.months).toBe(3);
    expect(computeDefenseFunds({ emergencyTarget: 0, emergencyCurrent: 0, peaceMonths: 9, essentialMonthly: 100, peaceCurrent: 0 }).peace.months).toBe(6);
  });

  it("exclusión de circularidad: reconoce los goal_type de los fondos de defensa", () => {
    expect(isDefenseFundGoalType("defensa:fondo_emergencia")).toBe(true);
    expect(isDefenseFundGoalType("defensa:fondo_paz")).toBe(true);
    expect(isDefenseFundGoalType("defensa:seguro_vida")).toBe(false);
    expect(isDefenseFundGoalType("casa")).toBe(false);
    expect(isDefenseFundGoalType(null)).toBe(false);
  });
});
