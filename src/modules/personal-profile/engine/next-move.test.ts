import { describe, it, expect } from "vitest";
import { buildNextMove, type FinancialState } from "@/modules/personal-profile/engine/next-move";

const state = (s: Partial<FinancialState>): FinancialState => ({
  hasBase: false,
  hasEmergencyFund: false,
  hasGoals: false,
  hasDebts: false,
  hasUrgentDebt: false,
  hasInvestments: false,
  ...s,
});

describe("buildNextMove", () => {
  it("estado vacío → Construir mi Base Financiera", () => {
    const m = buildNextMove(state({}));
    expect(m.cta).toBe("Construir mi Base Financiera");
    expect(m.route).toBe("/mi-base-financiera");
  });

  it("deuda urgente manda aunque haya base → Ordenar mis deudas", () => {
    const m = buildNextMove(state({ hasBase: true, hasUrgentDebt: true, hasDebts: true }));
    expect(m.cta).toBe("Ordenar mis deudas");
    expect(m.route).toBe("/deudas");
  });

  it("base sin fondo → Crear mi fondo de emergencia", () => {
    const m = buildNextMove(state({ hasBase: true }));
    expect(m.cta).toBe("Crear mi fondo de emergencia");
    expect(m.route).toBe("/control-financiero");
  });

  it("base + fondo + deudas (no urgentes) → Ver mi plan de deudas", () => {
    const m = buildNextMove(state({ hasBase: true, hasEmergencyFund: true, hasDebts: true }));
    expect(m.cta).toBe("Ver mi plan de deudas");
  });

  it("base + fondo, sin deudas ni metas → Definir mi meta principal", () => {
    const m = buildNextMove(state({ hasBase: true, hasEmergencyFund: true }));
    expect(m.cta).toBe("Definir mi meta principal");
  });

  it("base + fondo + metas, sin invertir → Empezar a invertir", () => {
    const m = buildNextMove(state({ hasBase: true, hasEmergencyFund: true, hasGoals: true }));
    expect(m.cta).toBe("Empezar a invertir");
    expect(m.route).toBe("/patrimonio");
  });

  it("todo hecho → medir y crecer", () => {
    const m = buildNextMove(
      state({ hasBase: true, hasEmergencyFund: true, hasGoals: true, hasInvestments: true }),
    );
    expect(m.title).toContain("medir y crecer");
    expect(m.cta).toBe("Ver mi patrimonio");
  });
});
