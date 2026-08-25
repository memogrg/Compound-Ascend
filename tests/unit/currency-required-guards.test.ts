import { describe, it, expect } from "vitest";
import { debtPaymentInputSchema } from "@/modules/control/schemas";
import { monedaDelPagoEsCoherente } from "@/modules/control/engine/debt-strategy";

/**
 * Delta 3 · B1 — la moneda del pago pasó de `.optional()` a REQUERIDA, para que el guard #437
 * (`monedaDelPagoEsCoherente`) SIEMPRE tenga con qué comparar (antes se saltaba en `undefined`).
 */
const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("B1 · debtPaymentInputSchema exige la moneda", () => {
  it("sin currency → falla la validación (ya no es opcional)", () => {
    const r = debtPaymentInputSchema.safeParse({
      debtId: UUID,
      paymentDate: "2026-08-25",
      amount: 5000,
    });
    expect(r.success).toBe(false);
  });

  it("con currency → valida", () => {
    const r = debtPaymentInputSchema.safeParse({
      debtId: UUID,
      paymentDate: "2026-08-25",
      amount: 5000,
      currency: "CRC",
    });
    expect(r.success).toBe(true);
  });
});

describe("B1 · el guard #437 con moneda definida siempre evalúa", () => {
  it("moneda nativa (CRC=CRC) → coherente (pasa)", () => {
    expect(monedaDelPagoEsCoherente("CRC", "CRC")).toBe(true);
  });
  it("moneda distinta (USD≠CRC) → incoherente (rechaza)", () => {
    expect(monedaDelPagoEsCoherente("USD", "CRC")).toBe(false);
  });
});
