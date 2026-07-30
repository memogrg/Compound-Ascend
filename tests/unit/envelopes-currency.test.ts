import { describe, it, expect } from "vitest";
import { normalizeEnvelopes } from "@/lib/ai/envelopes-currency";

const RATES = { USD: 1, CRC: 500 }; // 1 USD = 500 CRC

describe("normalizeEnvelopes · presupuestos convertidos a la moneda del asesor (no '$X como ₡X')", () => {
  const summaryUSD = {
    currency: "USD",
    expense: [
      { frasco: "Necesidades", envelopes: [{ name: "Supermercados", budget: 681.05 }, { name: "Transporte", budget: 200 }] },
      { frasco: "Estilo de vida", envelopes: [{ name: "Restaurantes", budget: 150 }] },
    ],
    goals: [{ frasco: "Metas", names: ["Viaje"] }],
  };

  it("sobres en USD → presupuestos en CRC (convertidos por el motor) y reetiquetados", () => {
    const r = normalizeEnvelopes(summaryUSD, "CRC", RATES);
    expect(r.envelopes.currency).toBe("CRC");
    // 681.05 USD × 500 = 340.525 CRC (redondeado).
    expect(r.envelopes.expense[0]!.envelopes[0]!.budget).toBe(340_525);
    expect(r.envelopes.expense[0]!.envelopes[1]!.budget).toBe(100_000); // 200 × 500
  });

  it("topGastoSobre = el sobre de MAYOR presupuesto, ya convertido a la moneda destino", () => {
    const r = normalizeEnvelopes(summaryUSD, "CRC", RATES);
    expect(r.topGastoSobre).toEqual({ name: "Supermercados", monthly: 340_525 });
  });

  it("si la moneda ya coincide, no convierte (solo redondea)", () => {
    const r = normalizeEnvelopes({ ...summaryUSD, currency: "CRC" }, "CRC", RATES);
    expect(r.envelopes.expense[0]!.envelopes[0]!.budget).toBe(681); // 681.05 → 681, sin ×500
    expect(r.topGastoSobre?.monthly).toBe(681);
  });
});
