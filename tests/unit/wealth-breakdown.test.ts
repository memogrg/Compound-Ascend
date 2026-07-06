import { describe, it, expect } from "vitest";
import { computeWealthBreakdown } from "@/lib/ai/wealth-breakdown";

// Mismo set que el demo Rich Life: liquido + inversion + productivo + uso_personal.
const ASSETS = [
  { assetClass: "liquido", value: 3_000_000 },
  { assetClass: "inversion", value: 4_200_000 },
  { assetClass: "productivo", value: 38_000_000 },
  { assetClass: "uso_personal", value: 9_000_000 },
];

describe("computeWealthBreakdown (motor puro)", () => {
  it("agrupa invertido/líquido/otros según el enum real de assetClass", () => {
    const r = computeWealthBreakdown(ASSETS);
    expect(r).toBeDefined();
    if (!r) return;
    expect(r.invested).toBe(4_200_000); // solo 'inversion'
    expect(r.liquid).toBe(3_000_000); // solo 'liquido'
    expect(r.other).toBe(47_000_000); // productivo + uso_personal
  });

  it("topClasses: hasta 3 clases, ordenadas desc por monto, con etiquetas legibles", () => {
    const r = computeWealthBreakdown(ASSETS);
    if (!r) throw new Error("esperaba desglose");
    expect(r.topClasses).toEqual([
      { label: "Productivos", value: 38_000_000 },
      { label: "Uso personal", value: 9_000_000 },
      { label: "Inversión", value: 4_200_000 },
    ]);
    // Líquidos (3M) es la 4.ª → queda fuera del top 3.
    expect(r.topClasses.some((c) => c.label === "Líquidos")).toBe(false);
  });

  it("agrega varios activos de la misma clase y redondea a 2 decimales", () => {
    const r = computeWealthBreakdown([
      { assetClass: "inversion", value: 1_000_000.004 },
      { assetClass: "inversion", value: 500_000.001 },
      { assetClass: "liquido", value: 250_000 },
    ]);
    if (!r) throw new Error("esperaba desglose");
    expect(r.invested).toBe(1_500_000.01); // suma redondeada a 2 dec
    expect(r.liquid).toBe(250_000);
    expect(r.other).toBe(0);
    expect(r.topClasses[0]).toEqual({ label: "Inversión", value: 1_500_000.01 });
  });

  it("clase desconocida cae en 'otros' y usa la clave como etiqueta de respaldo", () => {
    const r = computeWealthBreakdown([
      { assetClass: "cripto_raro", value: 999 },
      { assetClass: "inversion", value: 100 },
    ]);
    if (!r) throw new Error("esperaba desglose");
    expect(r.other).toBe(999);
    expect(r.invested).toBe(100);
    expect(r.topClasses[0]).toEqual({ label: "cripto_raro", value: 999 });
  });

  it("ignora valores no finitos sin romper", () => {
    const r = computeWealthBreakdown([
      { assetClass: "inversion", value: Number.NaN },
      { assetClass: "inversion", value: 200 },
    ]);
    if (!r) throw new Error("esperaba desglose");
    expect(r.invested).toBe(200);
  });

  it("sin activos → undefined", () => {
    expect(computeWealthBreakdown([])).toBeUndefined();
  });

  it("total no positivo (todo 0) → undefined (nada útil que desglosar)", () => {
    expect(
      computeWealthBreakdown([
        { assetClass: "liquido", value: 0 },
        { assetClass: "inversion", value: 0 },
      ]),
    ).toBeUndefined();
  });
});
