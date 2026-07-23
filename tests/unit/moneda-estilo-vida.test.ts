import { describe, it, expect } from "vitest";
import { parseDesiredLifestyle } from "@/modules/wealth/services/lifestyle-service";
import { convertCurrency } from "@/lib/fx";

/**
 * Regresión de moneda del estilo de vida deseado (Tramo 3).
 *
 * Antes se guardaba un NÚMERO pelado en `personal_profiles.extra`. Sin moneda, el mismo
 * valor se reinterpretaba al cambiar el topbar: "quiero gastar 5.000 al mes" pasaba de
 * dólares a colones sin tocar nada, y con él se movía el Número de Libertad.
 *
 * Ahora se guarda `{ amount, currency }`, y quien lo lee lo convierte a su moneda de
 * cálculo. `parseDesiredLifestyle` es el punto donde conviven las dos formas.
 */

const PRINCIPAL = "CRC";
const TASAS = { USD: 1, CRC: 510 };

describe("parseDesiredLifestyle — compatibilidad de las dos formas", () => {
  it("lee la forma nueva { amount, currency } tal cual", () => {
    expect(parseDesiredLifestyle({ amount: 3000, currency: "USD" }, PRINCIPAL)).toEqual({
      amount: 3000,
      currency: "USD",
    });
  });

  it("un número suelto (forma vieja) se interpreta en la moneda de respaldo, no sin unidad", () => {
    // Es la suposición menos mala para lo ya guardado: para quien nunca tocó el topbar,
    // coincide con lo que veía cuando lo definió.
    expect(parseDesiredLifestyle(2_500_000, PRINCIPAL)).toEqual({
      amount: 2_500_000,
      currency: PRINCIPAL,
    });
  });

  it("un objeto sin currency cae a la de respaldo, no a undefined", () => {
    expect(parseDesiredLifestyle({ amount: 1000 }, PRINCIPAL)).toEqual({
      amount: 1000,
      currency: PRINCIPAL,
    });
  });

  it("no definido, cero o basura → null (nunca se inventa un número de libertad)", () => {
    expect(parseDesiredLifestyle(undefined, PRINCIPAL)).toBeNull();
    expect(parseDesiredLifestyle(0, PRINCIPAL)).toBeNull();
    expect(parseDesiredLifestyle({ amount: 0, currency: "USD" }, PRINCIPAL)).toBeNull();
    expect(parseDesiredLifestyle("nada", PRINCIPAL)).toBeNull();
  });
});

describe("el estilo de vida se convierte a la moneda de cálculo, no se lee crudo", () => {
  it("3.000 USD deseados, cálculo en CRC: se convierten, no se comparan como colones", () => {
    // Reproduce el bug: sin convertir, 3000 (USD) se compararía contra gastos en colones,
    // y el Número de Libertad saldría ~510 veces menor de lo real.
    const parsed = parseDesiredLifestyle({ amount: 3000, currency: "USD" }, PRINCIPAL)!;
    const paraElCalculo = convertCurrency(parsed.amount, parsed.currency, "CRC", TASAS);
    expect(paraElCalculo).toBeCloseTo(3000 * TASAS.CRC, 0);
    expect(paraElCalculo).not.toBe(parsed.amount);
  });

  it("misma moneda que el cálculo: nada que convertir", () => {
    const parsed = parseDesiredLifestyle({ amount: 800_000, currency: "CRC" }, PRINCIPAL)!;
    expect(convertCurrency(parsed.amount, parsed.currency, "CRC", TASAS)).toBe(800_000);
  });
});
