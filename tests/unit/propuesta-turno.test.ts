/**
 * TARJETA HUÉRFANA — la propuesta pertenece al turno que la generó.
 *
 * El caso reportado: se preguntó por supermercados y salió, colgada de esa respuesta, la tarjeta
 * del gasto de transporte propuesto dos turnos antes. La tarjeta no se "movía" (vive colgada de su
 * mensaje): el modelo la RE-EMITÍA, porque el turno anterior sigue en la ventana de historial. Para
 * el usuario es indistinguible — y peor, porque un tap ahí registra el gasto dos veces.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { propuestaPerteneceAlTurno } from "@/lib/ai/propuesta-turno";

describe("un alta no puede nacer de una pregunta", () => {
  it("el caso exacto: preguntar por supermercados no admite la tarjeta de antes", () => {
    expect(
      propuestaPerteneceAlTurno("¿qué gastos están reportados para supermercados?", "create_transaction"),
    ).toBe(false);
  });

  it("cualquier consulta descarta el alta re-emitida", () => {
    expect(propuestaPerteneceAlTurno("¿cuánto gasté este mes?", "create_transaction")).toBe(false);
    expect(propuestaPerteneceAlTurno("cómo van mis metas", "create_transaction")).toBe(false);
    expect(propuestaPerteneceAlTurno("¿me alcanza para un helado?", "create_transactions_batch")).toBe(
      false,
    );
  });
});

describe("los pedidos de alta REALES pasan", () => {
  it("la orden imperativa", () => {
    expect(
      propuestaPerteneceAlTurno(
        "Agrega un gasto a transporte de vehículo de 37747 el día 2 de agosto",
        "create_transaction",
      ),
    ).toBe(true);
  });

  it("el hecho consumado", () => {
    expect(propuestaPerteneceAlTurno("gasté 5000 en el súper", "create_transaction")).toBe(true);
  });

  it("una PREGUNTA que igual pide registrar", () => {
    expect(
      propuestaPerteneceAlTurno("¿me registrás un gasto de 5000 en el súper?", "create_transaction"),
    ).toBe(true);
  });

  it('la confirmación de una repregunta ("dale", "sí")', () => {
    expect(propuestaPerteneceAlTurno("dale", "create_transaction")).toBe(true);
    expect(propuestaPerteneceAlTurno("sí, registralo", "create_transaction")).toBe(true);
  });

  it("una frase sin señales pero que tampoco es pregunta no se toca (ante duda, no se rompe)", () => {
    expect(propuestaPerteneceAlTurno("almuerzo en Subway 4500", "create_transaction")).toBe(true);
  });
});

describe("las acciones que nacen de un CONSEJO no se filtran", () => {
  it("responden a la pregunta del turno por definición", () => {
    const pregunta = "¿cuánto debería abonarle a la tarjeta?";
    expect(propuestaPerteneceAlTurno(pregunta, "debt_extra_payment")).toBe(true);
    expect(propuestaPerteneceAlTurno(pregunta, "adjust_budget")).toBe(true);
    expect(propuestaPerteneceAlTurno(pregunta, "create_goal")).toBe(true);
    expect(propuestaPerteneceAlTurno(pregunta, "set_dca")).toBe(true);
  });
});
