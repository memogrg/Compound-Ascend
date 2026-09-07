/**
 * El guardia del update optimista (#751).
 *
 * Anticipar un número en la barra sólo vale si es EXACTAMENTE el que va a
 * devolver el servidor. Si no, la barra salta y se corrige a la vista — peor que
 * esperar el round-trip. Este motor es el que decide cuándo se puede.
 */
import { describe, it, expect } from "vitest";
import { aporteOptimista } from "@/modules/control/engine/aporte-optimista";

describe("aporteOptimista", () => {
  it("misma moneda → se anticipa el monto completo", () => {
    expect(
      aporteOptimista({ aplicado: { amount: 5000, currency: "CRC" }, monedaEntidad: "CRC" }),
    ).toBe(5000);
  });

  it("OTRA moneda → no se anticipa nada", () => {
    // El servidor convierte; sumar el monto crudo pintaría un número falso que
    // después se corrige solo. Mejor no mover la barra.
    expect(
      aporteOptimista({ aplicado: { amount: 100, currency: "USD" }, monedaEntidad: "CRC" }),
    ).toBe(0);
  });

  it("monto cero o negativo → no se anticipa", () => {
    expect(
      aporteOptimista({ aplicado: { amount: 0, currency: "CRC" }, monedaEntidad: "CRC" }),
    ).toBe(0);
    expect(
      aporteOptimista({ aplicado: { amount: -50, currency: "CRC" }, monedaEntidad: "CRC" }),
    ).toBe(0);
  });

  it("monto no finito → no rompe, no anticipa", () => {
    expect(
      aporteOptimista({ aplicado: { amount: NaN, currency: "CRC" }, monedaEntidad: "CRC" }),
    ).toBe(0);
    expect(
      aporteOptimista({ aplicado: { amount: Infinity, currency: "CRC" }, monedaEntidad: "CRC" }),
    ).toBe(0);
  });

  it("la moneda se compara exacta: no hay normalización silenciosa", () => {
    // Si algún día hace falta case-insensitive, que sea una decisión explícita
    // y no un efecto colateral de este motor.
    expect(
      aporteOptimista({ aplicado: { amount: 10, currency: "crc" }, monedaEntidad: "CRC" }),
    ).toBe(0);
  });
});
