import { describe, it, expect } from "vitest";
import { convertCurrency, completeRateTable, FX_PER_USD, SUPPORTED_CURRENCIES } from "@/lib/fx";

describe("convertCurrency", () => {
  it("misma moneda no altera el monto", () => {
    expect(convertCurrency(1000, "CRC", "CRC")).toBe(1000);
    expect(convertCurrency(50, "USD", "USD")).toBe(50);
  });

  it("USD → CRC usa la tasa por USD", () => {
    expect(convertCurrency(100, "USD", "CRC")).toBe(100 * FX_PER_USD.CRC!);
  });

  it("CRC → USD es la inversa", () => {
    expect(convertCurrency(FX_PER_USD.CRC!, "CRC", "USD")).toBeCloseTo(1, 6);
  });

  it("ida y vuelta conserva el valor", () => {
    const back = convertCurrency(convertCurrency(2000, "EUR", "CRC"), "CRC", "EUR");
    expect(back).toBeCloseTo(2000, 6);
  });

  it("moneda desconocida: fallback sin alterar (no rompe el agregado)", () => {
    expect(convertCurrency(1000, "XYZ", "CRC")).toBe(1000);
    expect(convertCurrency(1000, "CRC", "XYZ")).toBe(1000);
  });

  it("monto no finito → 0 (evita NaN en sumas)", () => {
    expect(convertCurrency(Number.NaN, "USD", "CRC")).toBe(0);
    expect(convertCurrency(Number.POSITIVE_INFINITY, "USD", "CRC")).toBe(0);
  });

  it("acepta una tabla de tasas inyectada (FX en vivo a futuro)", () => {
    const live = { USD: 1, CRC: 500 };
    expect(convertCurrency(2, "USD", "CRC", live)).toBe(1000);
  });
});

describe("completeRateTable", () => {
  it("usa la tasa en vivo cuando es válida", () => {
    const t = completeRateTable({ CRC: 525, EUR: 0.9 });
    expect(t.CRC).toBe(525);
    expect(t.EUR).toBe(0.9);
  });

  it("rellena monedas faltantes con el respaldo estático", () => {
    const t = completeRateTable({ CRC: 525 });
    expect(t.MXN).toBe(FX_PER_USD.MXN);
    expect(t.COP).toBe(FX_PER_USD.COP);
  });

  it("ignora tasas inválidas (0, negativas, NaN) y usa el respaldo", () => {
    const t = completeRateTable({ CRC: 0, EUR: -1, MXN: Number.NaN });
    expect(t.CRC).toBe(FX_PER_USD.CRC);
    expect(t.EUR).toBe(FX_PER_USD.EUR);
    expect(t.MXN).toBe(FX_PER_USD.MXN);
  });

  it("ancla USD en 1 aunque el proveedor diga otra cosa", () => {
    const t = completeRateTable({ USD: 1.07 });
    expect(t.USD).toBe(1);
  });

  it("toda moneda soportada queda con una tasa positiva", () => {
    const t = completeRateTable({});
    for (const c of SUPPORTED_CURRENCIES) {
      expect(t[c]).toBeGreaterThan(0);
    }
  });
});
