import { describe, it, expect } from "vitest";
import { convertCurrency } from "@/lib/fx";
import { captureCurrencyDefault, CURRENCY_OPTIONS, CURRENCY_SYMBOL } from "@/lib/format";

/**
 * Regresión del bug "el monto cambia al cambiar la moneda de visualización":
 * la captura debe etiquetar el monto con la moneda de INGRESO (principal por
 * defecto, o la del ítem), nunca con la de visualización del topbar.
 */
describe("captureCurrencyDefault (moneda de captura, no de visualización)", () => {
  it("sin ítem ni prefill usa la principal — la de visualización ni siquiera es argumento", () => {
    // display = USD (irrelevante para la captura), principal = CRC.
    expect(captureCurrencyDefault(undefined, undefined, "CRC")).toBe("CRC");
    expect(captureCurrencyDefault(null, null, "CRC")).toBe("CRC");
  });

  it("al editar respeta la moneda del ítem por encima de todo", () => {
    expect(captureCurrencyDefault("EUR", "USD", "CRC")).toBe("EUR");
  });

  it("el prefill (recibo/compra) gana a la principal cuando no hay ítem", () => {
    expect(captureCurrencyDefault(undefined, "USD", "CRC")).toBe("USD");
  });
});

describe("payload de captura: nunca adopta la moneda de visualización", () => {
  it("gasto de ₡5.000 con display=USD se guarda como CRC y el round-trip no lo altera", () => {
    const display = "USD";
    const primary = "CRC";
    // El usuario no eligió moneda → default = principal (CRC), NO display.
    const payloadCurrency = captureCurrencyDefault(undefined, undefined, primary);
    expect(payloadCurrency).toBe("CRC");
    expect(payloadCurrency).not.toBe(display);

    // El monto nace bien etiquetado: convertir a USD y volver a CRC lo conserva.
    const amountCRC = 5000;
    const roundTrip = convertCurrency(
      convertCurrency(amountCRC, payloadCurrency, display),
      display,
      payloadCurrency,
    );
    expect(roundTrip).toBeCloseTo(amountCRC, 4);
  });
});

describe("CURRENCY_OPTIONS (fuente única de monedas)", () => {
  it("deriva de SUPPORTED_CURRENCIES con sus símbolos y sin perder ninguna", () => {
    expect(CURRENCY_OPTIONS.length).toBe(Object.keys(CURRENCY_SYMBOL).length);
    const crc = CURRENCY_OPTIONS.find((o) => o.code === "CRC");
    const usd = CURRENCY_OPTIONS.find((o) => o.code === "USD");
    expect(crc?.symbol).toBe("₡");
    expect(usd?.symbol).toBe("$");
    // MXN/COP desambiguados (no "$" plano) en los selectores.
    expect(CURRENCY_OPTIONS.find((o) => o.code === "MXN")?.symbol).toBe("MX$");
  });
});
