import { describe, it, expect } from "vitest";
import {
  debtPaymentToTxn,
  goalContributionToTxn,
  dividendToTxn,
  rentalPaymentToTxn,
} from "@/modules/financial-base/engine/linked";
import { txnInputSchema } from "@/modules/financial-base/schemas";

describe("builders del orquestador de vínculos (Fase 1)", () => {
  it("pago de deuda → gasto vinculado con monto total (cuota + extra)", () => {
    const txn = debtPaymentToTxn({
      debtId: "11111111-1111-1111-1111-111111111111",
      debtName: "Tarjeta BAC",
      currency: "CRC",
      paymentDate: "2026-06-15",
      amount: 45000,
      extraAmount: 10000,
      categoryId: "22222222-2222-2222-2222-222222222222",
    });
    expect(txn.kind).toBe("gasto");
    expect(txn.amount).toBe(55000);
    expect(txn.linkedKind).toBe("debt");
    expect(txn.linkedId).toBe("11111111-1111-1111-1111-111111111111");
    expect(txn.description).toBe("Pago — Tarjeta BAC");
    // Debe pasar el mismo schema que usa createTransaction.
    expect(() => txnInputSchema.parse(txn)).not.toThrow();
  });

  it("pago sin extra usa solo la cuota", () => {
    const txn = debtPaymentToTxn({
      debtId: "11111111-1111-1111-1111-111111111111",
      debtName: "Préstamo",
      currency: "USD",
      paymentDate: "2026-06-01",
      amount: 300,
    });
    expect(txn.amount).toBe(300);
    expect(txn.currency).toBe("USD");
  });

  it("aporte a meta → gasto vinculado a la meta, sin categoría fija", () => {
    const txn = goalContributionToTxn({
      goalId: "33333333-3333-3333-3333-333333333333",
      goalName: "Fondo de emergencia",
      currency: "CRC",
      contributionDate: "2026-06-10",
      amount: 100000,
    });
    expect(txn.kind).toBe("gasto");
    expect(txn.linkedKind).toBe("goal");
    expect(txn.categoryId).toBeNull();
    expect(() => txnInputSchema.parse(txn)).not.toThrow();
  });

  it("dividendo → ingreso vinculado al holding", () => {
    const txn = dividendToTxn({
      holdingId: "44444444-4444-4444-4444-444444444444",
      label: "VOO",
      currency: "USD",
      paymentDate: "2026-06-20",
      amount: 125.5,
      categoryId: null,
    });
    expect(txn.kind).toBe("ingreso");
    expect(txn.linkedKind).toBe("holding");
    expect(txn.linkedId).toBe("44444444-4444-4444-4444-444444444444");
    expect(txn.description).toBe("Dividendo — VOO");
    expect(() => txnInputSchema.parse(txn)).not.toThrow();
  });

  it("renta cobrada → ingreso vinculado al activo", () => {
    const txn = rentalPaymentToTxn({
      holdingId: "55555555-5555-5555-5555-555555555555",
      label: "Apartamento Escazú",
      currency: "CRC",
      receivedOn: "2026-06-05",
      amount: 450000,
    });
    expect(txn.kind).toBe("ingreso");
    expect(txn.linkedKind).toBe("rental");
    expect(txn.description).toBe("Renta — Apartamento Escazú");
    expect(() => txnInputSchema.parse(txn)).not.toThrow();
  });

  it("el vínculo es opt-in: una transacción normal pasa el schema sin él", () => {
    const parsed = txnInputSchema.parse({
      kind: "gasto",
      amount: 1000,
      currency: "CRC",
      occurredOn: "2026-06-09",
    });
    expect(parsed.linkedKind ?? "none").toBe("none");
    expect(parsed.linkedId ?? null).toBeNull();
  });
});
