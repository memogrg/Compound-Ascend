/**
 * Cómo se cambia de plan en Google Play: subir entra ya; bajar o cambiar solo el período, al
 * vencer lo pagado. La tabla completa de 6 × 6 (plan × período), sin casos sueltos.
 */
import { describe, it, expect } from "vitest";
import { PRORATION_MODE, modoDeCambio, productoSinBasePlan } from "@/lib/capacitor/purchases";
import { PAID_PLANS, PERIODOS, PLAN_RANK } from "@/lib/plan";

const { IMMEDIATE_WITH_TIME_PRORATION: YA, DEFERRED: AL_VENCER } = PRORATION_MODE;

describe("PRORATION_MODE", () => {
  it("los valores son los del enum de RevenueCat 17.25.0", () => {
    expect(YA).toBe(1);
    expect(AL_VENCER).toBe(6);
  });
});

describe("modoDeCambio", () => {
  const combinaciones = PAID_PLANS.flatMap((plan) =>
    PERIODOS.map((periodo) => ({ plan, periodo })),
  );

  for (const actual of combinaciones) {
    for (const destino of combinaciones) {
      if (actual.plan === destino.plan && actual.periodo === destino.periodo) continue;
      const esperado = PLAN_RANK[destino.plan] > PLAN_RANK[actual.plan] ? YA : AL_VENCER;
      it(`${actual.plan}/${actual.periodo} → ${destino.plan}/${destino.periodo}: ${esperado === YA ? "ya" : "al vencer"}`, () => {
        expect(modoDeCambio(actual, destino)).toBe(esperado);
      });
    }
  }

  it("casos que importan, escritos a mano", () => {
    expect(
      modoDeCambio({ plan: "esencial", periodo: "anual" }, { plan: "max", periodo: "mensual" }),
    ).toBe(YA);
    expect(
      modoDeCambio({ plan: "pro", periodo: "mensual" }, { plan: "pro", periodo: "anual" }),
    ).toBe(AL_VENCER);
    expect(
      modoDeCambio({ plan: "pro", periodo: "anual" }, { plan: "pro", periodo: "mensual" }),
    ).toBe(AL_VENCER);
    expect(
      modoDeCambio({ plan: "max", periodo: "mensual" }, { plan: "esencial", periodo: "anual" }),
    ).toBe(AL_VENCER);
  });
});

describe("productoSinBasePlan", () => {
  it("quita el base plan de Play y deja intacto un id sin él", () => {
    expect(productoSinBasePlan("cartera_proplus_mensual:anual")).toBe("cartera_proplus_mensual");
    expect(productoSinBasePlan("cartera_proplus_mensual:mensual")).toBe("cartera_proplus_mensual");
    expect(productoSinBasePlan("cartera_proplus_anual")).toBe("cartera_proplus_anual");
  });
});
