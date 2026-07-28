import { describe, it, expect } from "vitest";
import { computeMarketScenario } from "@/lib/ai/tools";

describe("computeMarketScenario · ganancia REAL con datos del tool + invertido del contexto", () => {
  it("cripto con ATH: valor y ganancia al precio actual y al ATH (escenario), con label 'ath'", () => {
    // KMNO: 100 uds, invertido 500.000; precio actual 5.600; ATH 8.000.
    const r = computeMarketScenario({
      symbol: "KMNO",
      assetType: "crypto",
      currency: "USD",
      price: 5600,
      high: 8000,
      highKind: "ath",
      highDate: "2024-03-14",
      invertido: 500000,
      cantidad: 100,
    });
    expect(r.maximo_tipo).toBe("ath");
    expect(r.valor_actual).toBe(560000); // 100 × 5600
    expect(r.ganancia_al_precio_actual).toBe(60000); // 560.000 − 500.000
    expect(r.valor_al_maximo).toBe(800000); // 100 × 8000
    expect(r.ganancia_al_maximo).toBe(300000); // 800.000 − 500.000 (hipotético)
    expect(r.nota).toMatch(/ATH|cronometrar/i); // caveat de techo no cronometrable
  });

  it("acción/ETF: el 'máximo' se ETIQUETA como 52 semanas, no como ATH", () => {
    const r = computeMarketScenario({
      symbol: "VOO",
      assetType: "stock",
      currency: "USD",
      price: 500,
      high: 560,
      highKind: "52w",
      highDate: "2025-01-02",
      invertido: 10000,
      cantidad: 30,
    });
    expect(r.maximo_tipo).toBe("52_semanas");
    expect(r.nota).toMatch(/52 semanas/i);
    expect(r.ganancia_al_maximo).toBe(30 * 560 - 10000);
  });

  it("sin posición (falta invertido/cantidad) → devuelve precio y máximo, sin inventar la ganancia", () => {
    const r = computeMarketScenario({
      symbol: "BTC",
      assetType: "crypto",
      currency: "USD",
      price: 60000,
      high: 73000,
      highKind: "ath",
      highDate: "2024-03-14",
    });
    expect(r.precio_actual).toBe(60000);
    expect(r.maximo).toBe(73000);
    expect(r.valor_actual).toBeNull();
    expect(r.ganancia_al_precio_actual).toBeNull();
    expect(r.ganancia_al_maximo).toBeNull();
  });

  it("precio ≤0 (basura del $0) se trata como NO disponible, pero el escenario al ATH SÍ se calcula", () => {
    // JUP: precio $0 (id malo / cero viejo), ATH real $2; 1.250 uds, invertido 500.
    const r = computeMarketScenario({
      symbol: "JUP",
      assetType: "crypto",
      currency: "USD",
      price: 0,
      high: 2,
      highKind: "ath",
      highDate: "2024-01-31",
      invertido: 500,
      cantidad: 1250,
    });
    expect(r.precio_actual).toBeNull(); // 0 → null (NUNCA "$0")
    expect(r.valor_actual).toBeNull(); // sin precio actual no hay valor actual
    expect(r.ganancia_al_precio_actual).toBeNull();
    // pero el máximo y su escenario sí:
    expect(r.maximo).toBe(2);
    expect(r.maximo_tipo).toBe("ath");
    expect(r.cantidad).toBe(1250);
    expect(r.invertido).toBe(500);
    expect(r.valor_al_maximo).toBe(2500); // 1.250 × 2
    expect(r.ganancia_al_maximo).toBe(2000); // 2.500 − 500
  });

  it("sin dato de mercado (todo null) → nota ofrece simular con un precio objetivo", () => {
    const r = computeMarketScenario({
      symbol: "XYZ",
      assetType: "stock",
      currency: "USD",
      price: null,
      high: null,
      highKind: null,
      highDate: null,
      invertido: 1000,
      cantidad: 5,
    });
    expect(r.maximo_tipo).toBeNull();
    expect(r.precio_actual).toBeNull();
    expect(r.ganancia_al_maximo).toBeNull();
    expect(r.nota).toMatch(/precio objetivo|simular/i);
  });
});
