import { describe, it, expect } from "vitest";
import { estimatePaymentSplit } from "@/modules/control/engine/amortization";

describe("desglose cuota vs extra (Fase 7 · pagos vía Gastos)", () => {
  const base = { cuota: 45000, balance: 850000, apr: 38.5 };
  // Interés del mes con la misma regla que recomputeFromPayments:
  // 850000 × (38.5/100/12) ≈ 27270.83
  const interesMes = Math.round((850000 * (38.5 / 100 / 12)) * 100) / 100;

  it("pago exacto a la cuota: extra 0, split estimado", () => {
    const s = estimatePaymentSplit({ ...base, totalPaid: 45000 });
    expect(s.amount).toBe(45000);
    expect(s.extraAmount).toBe(0);
    expect(s.interest).toBeCloseTo(interesMes, 2);
    expect(s.principal).toBeCloseTo(45000 - interesMes, 2);
  });

  it("pago mayor a la cuota: el excedente es extra y amortiza capital", () => {
    const s = estimatePaymentSplit({ ...base, totalPaid: 55000 });
    expect(s.amount).toBe(45000);
    expect(s.extraAmount).toBe(10000);
    expect(s.interest).toBeCloseTo(interesMes, 2);
    // El capital total incluye el extra completo.
    expect(s.principal).toBeCloseTo(55000 - interesMes, 2);
  });

  it("pago menor a la cuota: todo cuenta como cuota, sin extra", () => {
    const s = estimatePaymentSplit({ ...base, totalPaid: 30000 });
    expect(s.amount).toBe(30000);
    expect(s.extraAmount).toBe(0);
    expect(s.interest).toBeCloseTo(interesMes, 2);
    expect(s.principal).toBeCloseTo(30000 - interesMes, 2);
  });

  it("sin tasa registrada: split cuota/extra sí, estimación no", () => {
    const s = estimatePaymentSplit({ totalPaid: 55000, cuota: 45000, balance: 850000, apr: null });
    expect(s.amount).toBe(45000);
    expect(s.extraAmount).toBe(10000);
    expect(s.principal).toBeNull();
    expect(s.interest).toBeNull();
  });

  it("sin cuota conocida: todo el pago cuenta como cuota", () => {
    const s = estimatePaymentSplit({ totalPaid: 55000, cuota: 0, balance: 850000, apr: 38.5 });
    expect(s.amount).toBe(55000);
    expect(s.extraAmount).toBe(0);
  });

  it("el interés no supera la cuota y el capital no supera el saldo", () => {
    // Pago pequeño con interés alto: interés capped a la cuota pagada.
    const s = estimatePaymentSplit({ totalPaid: 10000, cuota: 45000, balance: 850000, apr: 38.5 });
    expect(s.interest).toBe(10000);
    expect(s.principal).toBe(0);
    // Pago gigante: capital capped al saldo.
    const s2 = estimatePaymentSplit({ totalPaid: 2000000, cuota: 45000, balance: 850000, apr: 38.5 });
    expect(s2.principal).toBe(850000);
  });
});
