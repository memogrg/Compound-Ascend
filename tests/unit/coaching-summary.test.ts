/**
 * Resumen determinista del turno de coaching (prioridad + acción resuelta) para el hilo persistente.
 * Sin LLM, sin fabricación: todo sale de la señal prioritaria y del payload YA resuelto.
 */
import { describe, it, expect } from "vitest";
import { buildCoachingSummary } from "@/lib/ai/coaching-summary";

describe("buildCoachingSummary", () => {
  it("combina prioridad + acción (create_goal con aporte)", () => {
    const s = buildCoachingSummary("construir tu fondo de emergencia", {
      type: "create_goal",
      payload: { monthlyContribution: 43000 },
    });
    expect(s).toBe(
      "prioridad: construir tu fondo de emergencia · recomendé aportar ₡43000/mes al fondo",
    );
  });

  it("abono a deuda con su nombre", () => {
    const s = buildCoachingSummary("salir de deudas", {
      type: "debt_extra_payment",
      payload: { amount: 100000, name: "Tarjeta Oro" },
    });
    expect(s).toBe("prioridad: salir de deudas · recomendé abonar ₡100000 a Tarjeta Oro");
  });

  it("solo prioridad si no hubo acción", () => {
    expect(buildCoachingSummary("frenar el gasto", null)).toBe("prioridad: frenar el gasto");
  });

  it("solo acción si no hubo prioridad", () => {
    expect(
      buildCoachingSummary(undefined, { type: "set_dca", payload: { amount: 200, symbol: "VOO" } }),
    ).toBe("recomendé invertir ₡200/mes en VOO");
  });

  it("null si no hay ni prioridad ni acción accionable (no es turno de coaching)", () => {
    expect(buildCoachingSummary(undefined, null)).toBeNull();
    expect(buildCoachingSummary("", { type: "create_price_alert", payload: {} })).toBeNull();
  });

  it("no inventa montos: monto ausente/no-positivo cae a la frase sin cifra", () => {
    expect(
      buildCoachingSummary("tu fondo", {
        type: "create_goal",
        payload: { monthlyContribution: 0 },
      }),
    ).toBe("prioridad: tu fondo · recomendé crear el fondo");
  });
});
