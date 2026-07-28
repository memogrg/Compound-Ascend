import { describe, it, expect } from "vitest";
import { holdingDisplayCurrency, isQuotedAsset, QUOTE_CURRENCY } from "@/modules/wealth/engine/quote-currency";

describe("holdingDisplayCurrency · los cotizados se muestran en USD, no en la registrada", () => {
  it("cripto / acción / ETF → USD aunque el usuario tenga CRC de principal", () => {
    expect(holdingDisplayCurrency("cripto", "CRC")).toBe("USD");
    expect(holdingDisplayCurrency("accion", "CRC")).toBe("USD");
    expect(holdingDisplayCurrency("etf", "CRC")).toBe("USD");
    expect(QUOTE_CURRENCY).toBe("USD");
  });

  it("no cotizado (inmueble/negocio/plan/certificado) → su moneda registrada", () => {
    expect(holdingDisplayCurrency("inmueble", "CRC")).toBe("CRC");
    expect(holdingDisplayCurrency("negocio", "USD")).toBe("USD");
    expect(holdingDisplayCurrency("pension", "EUR")).toBe("EUR");
    expect(holdingDisplayCurrency("certificado", "CRC")).toBe("CRC");
  });

  it("assetType nulo/desconocido → registrada (no fuerza USD)", () => {
    expect(holdingDisplayCurrency(null, "CRC")).toBe("CRC");
    expect(holdingDisplayCurrency(undefined, "MXN")).toBe("MXN");
    expect(holdingDisplayCurrency("otro", "CRC")).toBe("CRC");
  });

  it("isQuotedAsset marca solo etf/accion/cripto", () => {
    expect(isQuotedAsset("cripto")).toBe(true);
    expect(isQuotedAsset("inmueble")).toBe(false);
    expect(isQuotedAsset(null)).toBe(false);
  });
});
