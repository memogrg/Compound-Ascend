import { describe, it, expect } from "vitest";
import {
  convertCurrency,
  btcPerUsd,
  currencyDecimals,
  isCryptoCurrency,
  SUPPORTED_CURRENCIES,
  FX_PER_USD,
} from "@/lib/fx";
import { formatMoney, CURRENCY_OPTIONS, DISPLAY_CURRENCY_OPTIONS } from "@/lib/format";

describe("BTC como moneda", () => {
  it("está en SUPPORTED_CURRENCIES y se reconoce como cripto", () => {
    expect(SUPPORTED_CURRENCIES).toContain("BTC");
    expect(isCryptoCurrency("BTC")).toBe(true);
    expect(isCryptoCurrency("USD")).toBe(false);
  });

  it("convertir 0.01 BTC → USD usa la tasa VIVA (1/precio)", () => {
    const { rate } = btcPerUsd(66000); // BTC vivo a $66.000
    const rates = { ...FX_PER_USD, USD: 1, BTC: rate };
    expect(convertCurrency(0.01, "BTC", "USD", rates)).toBeCloseTo(660, 6);
  });

  it("feed caído → stale, y NO presenta el estático como vivo", () => {
    expect(btcPerUsd(66000)).toEqual({ rate: 1 / 66000, stale: false });
    const down = btcPerUsd(null);
    expect(down.stale).toBe(true); // marcado stale
    expect(down.rate).toBe(FX_PER_USD.BTC); // estático SOLO como respaldo, con flag stale
    expect(btcPerUsd(0).stale).toBe(true); // precio inválido también es stale
    expect(btcPerUsd(NaN).stale).toBe(true);
  });

  it("formato: BTC con 8 decimales (satoshis); fiat sin cambios", () => {
    expect(currencyDecimals("BTC")).toBe(8);
    expect(currencyDecimals("USD")).toBe(0);
    expect(formatMoney(0.005, "BTC")).toBe("₿0,00500000");
    expect(formatMoney(1.23456789, "BTC")).toBe("₿1,23456789");
    // Fiat: default 0 decimales (histórico) y el override explícito de 2 sigue intacto.
    expect(formatMoney(1966410, "CRC")).toBe("₡1.966.410");
    expect(formatMoney(12.5, "USD", 2)).toBe("$12,50");
    expect(formatMoney(12.5, "USD")).toBe("$13"); // sin decimales explícitos = 0 (fiat)
  });

  it("selectores: la captura incluye BTC; el display/principal NO", () => {
    expect(CURRENCY_OPTIONS.some((o) => o.code === "BTC")).toBe(true);
    expect(DISPLAY_CURRENCY_OPTIONS.some((o) => o.code === "BTC")).toBe(false);
  });
});
