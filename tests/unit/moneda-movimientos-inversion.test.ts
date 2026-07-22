import { describe, it, expect } from "vitest";
import { monedaDelMovimientoEsCoherente } from "@/modules/wealth/engine/portfolio-engine";
import { normalizeHoldings } from "@/modules/wealth/services/portfolio-service";
import { convertCurrency } from "@/lib/fx";
import type { Holding } from "@/modules/wealth/types";

/**
 * Regresión de moneda en los movimientos sobre inversiones (Tramo 2 de la auditoría).
 *
 * Misma familia que `moneda-pago-deuda.test.ts`, y por la misma causa: el view-model
 * convierte los importes a la moneda principal y NO toca `currency`, así que un formulario
 * que precargue de ahí manda un número en una unidad con una etiqueta en otra.
 *
 * Los 851 tests que había cuando ocurrió el P0 pasaron con el fallo dentro porque ninguno
 * ejercitaba una entidad en moneda distinta a la principal. Aquí se cubre ese caso para
 * inversiones.
 */

const PRINCIPAL = "CRC";
const TASAS = { USD: 1, CRC: 510 };

/** Un inmueble de renta en dólares, con la app en colones. */
const INMUEBLE_USD = {
  id: "h1",
  symbol: "APTO",
  assetType: "otro",
  quantity: 1,
  averageCost: 120_000,
  currency: "USD",
  rentalIncome: 900,
} as unknown as Holding;

describe("normalizeHoldings deja un objeto que NO sirve para capturar", () => {
  it("convierte los importes y conserva la moneda nativa: por eso no se puede precargar de ahí", () => {
    const [norm] = normalizeHoldings([INMUEBLE_USD], PRINCIPAL, TASAS);

    // La etiqueta sigue diciendo USD…
    expect(norm!.currency).toBe("USD");
    // …pero el importe ya está en colones. Ese cruce es todo el problema.
    expect(norm!.rentalIncome).toBeCloseTo(convertCurrency(900, "USD", PRINCIPAL, TASAS), 2);
    expect(norm!.rentalIncome).not.toBe(INMUEBLE_USD.rentalIncome);

    // El factor exacto que se colaba en el ledger si alguien precargaba de aquí.
    expect(norm!.rentalIncome! / INMUEBLE_USD.rentalIncome!).toBeCloseTo(TASAS.CRC, 0);
  });

  it("el holding CRUDO mantiene importe y moneda en la misma unidad", () => {
    expect(INMUEBLE_USD.rentalIncome).toBe(900);
    expect(INMUEBLE_USD.currency).toBe("USD");
  });
});

describe("guarda: el importe de un movimiento viene en la moneda de su inversión", () => {
  it("rechaza un importe etiquetado en la moneda principal cuando la inversión es en USD", () => {
    expect(monedaDelMovimientoEsCoherente(PRINCIPAL, "USD")).toBe(false);
  });

  it("acepta el importe en la moneda de la inversión", () => {
    expect(monedaDelMovimientoEsCoherente("USD", "USD")).toBe(true);
  });

  it("deja pasar a quien no manda moneda, porque el servicio impone la del holding", () => {
    // No es un permiso: es el estado heredado. La protección real es que el servicio
    // escriba `holding.currency` en vez de lo que llegue.
    expect(monedaDelMovimientoEsCoherente(undefined, "USD")).toBe(true);
  });

  it("una renta precargada del VM convertido queda fuera de rango respecto de la nativa", () => {
    // Reproduce el camino que estaba roto: precargar de `normalizeHoldings` y etiquetar con
    // la nativa. El número entra multiplicado por el tipo de cambio.
    const [norm] = normalizeHoldings([INMUEBLE_USD], PRINCIPAL, TASAS);
    const importeQueSeGuardaba = norm!.rentalIncome!;
    const importeCorrecto = INMUEBLE_USD.rentalIncome!;

    expect(importeQueSeGuardaba).toBeGreaterThan(importeCorrecto * 100);
    // Y la etiqueta con la que se guardaba era la nativa, así que el par era incoherente
    // sin que nada lo dijera.
    expect(norm!.currency).toBe(INMUEBLE_USD.currency);
  });
});
