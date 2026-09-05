import { describe, it, expect } from "vitest";
import { suggestedReceipt } from "@/modules/financial-base/engine/income-receipt";

const source = (
  over: Partial<{ amount: number; frequency: string; recurringItemId: string | null }> = {},
) => ({ amount: 1000, frequency: "mensual", recurringItemId: null, ...over });

describe("suggestedReceipt", () => {
  it("sin recibir aún: sugiere el restante (todo el monto)", () => {
    expect(suggestedReceipt(source(), 0)).toBe(1000);
  });

  it("recibido parcial: sugiere lo que falta del mes", () => {
    expect(suggestedReceipt(source(), 600)).toBe(400);
  });

  // La regla de producto: al 100% (o por encima) SIGUE siendo registrable — la sugerencia
  // nunca es 0, para poder anotar lo real (que puede exceder al plan) de un toque.
  it("al 100%: registrable — sugiere el monto pleno, nunca 0", () => {
    expect(suggestedReceipt(source(), 1000)).toBe(1000);
  });

  it("por encima del 100%: registrable — no devuelve 0 ni negativo", () => {
    const s = suggestedReceipt(source(), 1500);
    expect(s).toBeGreaterThan(0);
    expect(s).toBe(1000);
  });

  // SEMÁNTICA ÚNICA: el monto de la fuente es lo que llega POR PAGO. Cada clic de
  // "Recibido" en una fuente sub-mensual es UN pago, así que se sugiere el pago
  // PLENO — no una fracción. Antes RECURRENT_FRACTION lo partía por la mitad
  // (asumía que el monto era mensual) y sugería media quincena.
  it("sub-mensual: sugiere el pago PLENO, no una fracción", () => {
    expect(suggestedReceipt(source({ frequency: "quincenal", recurringItemId: "r1" }), 0)).toBe(
      1000,
    );
    expect(suggestedReceipt(source({ frequency: "semanal", recurringItemId: "r1" }), 0)).toBe(1000);
  });

  it("sub-mensual: el segundo pago del mes también sugiere el pago pleno", () => {
    // Ya se recibió una quincena; la siguiente vale lo mismo.
    expect(suggestedReceipt(source({ frequency: "quincenal", recurringItemId: "r1" }), 1000)).toBe(
      1000,
    );
  });

  it("multi-mes: el pago llega una vez, así que sugiere lo que falta de ese pago", () => {
    expect(suggestedReceipt(source({ frequency: "bimensual", recurringItemId: "r1" }), 0)).toBe(
      1000,
    );
    expect(suggestedReceipt(source({ frequency: "bimensual", recurringItemId: "r1" }), 400)).toBe(
      600,
    );
  });

  it("redondea a 2 decimales", () => {
    expect(suggestedReceipt(source({ amount: 333.333 }), 0)).toBe(333.33);
  });
});
