/**
 * Qué cuenta como «tengo fondo de emergencia» y «tengo fondo de paz».
 *
 * Había DOS implementaciones y no decían lo mismo. `wealth-service` miraba `goal_type` con saldo
 * (correcto). `rich-life-service` usaba un proxy: «¿tiene algún activo líquido?» — sobre unos
 * activos «líquidos» que son SINTÉTICOS (el saco de liquidez más TODA meta con saldo). Con eso,
 * cualquier meta con plata encendía los dos fondos: en la cuenta de demo, «Universidad de Sofía»
 * —el fondo para la universidad de una hija— contaba como fondo de PAZ.
 *
 * Y no se quedaba en Rich Life: `patrimonio-service` reusa ese agregado, así que el proxy llegaba
 * hasta el puntaje de protección de la tarjeta del panel, que es la que dispara
 * `alta_tasa_baja_proteccion`.
 */
import { describe, it, expect } from "vitest";

import { tieneFondoDeDefensa } from "@/modules/wealth";

/** Las metas REALES de la cuenta de demo. */
const METAS_DEMO = [
  { goal_type: "defensa:fondo_emergencia", current_amount: 1_520_000 },
  { goal_type: null, current_amount: 700_000 }, // «Universidad de Sofía»
];

describe("tieneFondoDeDefensa", () => {
  it("la demo tiene fondo de emergencia", () => {
    expect(tieneFondoDeDefensa(METAS_DEMO, "defensa:fondo_emergencia")).toBe(true);
  });

  it("y NO tiene fondo de paz, aunque «Universidad de Sofía» tenga ₡700.000", () => {
    // El caso que pide el plan: una meta con saldo que no es un fondo de defensa no puede
    // encender la casilla de protección.
    expect(tieneFondoDeDefensa(METAS_DEMO, "defensa:fondo_paz")).toBe(false);
  });

  it("registrado pero vacío no protege de nada", () => {
    expect(
      tieneFondoDeDefensa(
        [{ goal_type: "defensa:fondo_paz", current_amount: 0 }],
        "defensa:fondo_paz",
      ),
    ).toBe(false);
  });

  it("tolera lo que devuelve PostgREST: numéricos como texto, y nulos", () => {
    expect(
      tieneFondoDeDefensa(
        [{ goal_type: "defensa:fondo_paz", current_amount: "250000" }],
        "defensa:fondo_paz",
      ),
    ).toBe(true);
    expect(tieneFondoDeDefensa([{ goal_type: "defensa:fondo_paz" }], "defensa:fondo_paz")).toBe(
      false,
    );
    expect(tieneFondoDeDefensa([], "defensa:fondo_paz")).toBe(false);
  });
});
