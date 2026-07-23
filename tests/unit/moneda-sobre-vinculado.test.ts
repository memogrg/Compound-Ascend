import { describe, it, expect } from "vitest";
import { monedaVinculadaEsCoherente } from "@/modules/financial-base/engine/expense-jars";

/**
 * Regresión de moneda en el gasto sobre un sobre VINCULADO (Tramo 3).
 *
 * El vector real: el sobre "Tarjeta" está ligado a una deuda en USD. Un gasto sobre ese
 * sobre es un pago de esa deuda, y propaga a `debt_payments` — que NO tiene columna de
 * moneda, así que su `amount` es siempre la de la deuda.
 *
 * La guarda del Tramo 1 (#474) vive en `control-service.addDebtPayment`, pero esta ruta va
 * por `linked-transaction-service.propagateLinkedTransaction`, que insertaba en
 * `debt_payments` SIN comparar la moneda. Este es el hueco que faltaba cerrar: mismo P0,
 * otra puerta.
 */

describe("guarda: el gasto vinculado viene en la moneda de su entidad", () => {
  it("rechaza un importe en la moneda de visualización sobre una deuda en USD", () => {
    // App en colones, deuda en dólares: el caso del sobre "Tarjeta".
    expect(monedaVinculadaEsCoherente("CRC", "USD")).toBe(false);
  });

  it("acepta el importe cuando viene en la moneda de la entidad", () => {
    expect(monedaVinculadaEsCoherente("USD", "USD")).toBe(true);
  });

  it("deja pasar a quien no manda moneda, que es el estado heredado", () => {
    // No es un permiso: es la razón por la que la ruta no estaba protegida. La protección
    // real es que el modal MANDE la moneda de la entidad, no solo que exista la guarda.
    expect(monedaVinculadaEsCoherente(undefined, "USD")).toBe(true);
  });

  it("una meta en colones también se protege", () => {
    expect(monedaVinculadaEsCoherente("USD", "CRC")).toBe(false);
    expect(monedaVinculadaEsCoherente("CRC", "CRC")).toBe(true);
  });
});
