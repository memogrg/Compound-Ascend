import { describe, it, expect } from "vitest";
import {
  debtPaymentToTxn,
  goalContributionToTxn,
  goalWithdrawalToTxn,
  dividendToTxn,
  rentalPaymentToTxn,
  holdingSaleToTxn,
  holdingPurchaseToTxn,
  purchaseExpenseAmount,
  positionIncreaseAmount,
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

  it("venta de posición → ingreso vinculado al holding (Fase 4)", () => {
    const txn = holdingSaleToTxn({
      holdingId: "66666666-6666-6666-6666-666666666666",
      label: "VOO",
      currency: "USD",
      saleDate: "2026-06-15",
      amount: 2500,
      categoryId: null,
    });
    expect(txn.kind).toBe("ingreso");
    expect(txn.linkedKind).toBe("holding");
    expect(txn.description).toBe("Venta — VOO");
    expect(() => txnInputSchema.parse(txn)).not.toThrow();
  });

  it("retiro de meta → ingreso vinculado a la meta (Fase 4)", () => {
    const txn = goalWithdrawalToTxn({
      goalId: "77777777-7777-7777-7777-777777777777",
      goalName: "Fondo de emergencia",
      currency: "CRC",
      withdrawalDate: "2026-06-15",
      amount: 50000,
    });
    expect(txn.kind).toBe("ingreso");
    expect(txn.linkedKind).toBe("goal");
    expect(txn.description).toBe("Retiro — Fondo de emergencia");
    expect(() => txnInputSchema.parse(txn)).not.toThrow();
  });

  it("compra de inversión → gasto vinculado (Fase 4.1)", () => {
    const txn = holdingPurchaseToTxn({
      holdingId: "88888888-8888-8888-8888-888888888888",
      label: "VOO",
      currency: "USD",
      purchaseDate: "2026-06-10",
      amount: 4000,
      verb: "Compra",
      categoryId: "99999999-9999-9999-9999-999999999999",
    });
    expect(txn.kind).toBe("gasto");
    expect(txn.linkedKind).toBe("holding");
    expect(txn.description).toBe("Compra — VOO");
    expect(() => txnInputSchema.parse(txn)).not.toThrow();
  });

  it("monto de compra = lo pagado (cantidad × costo); valor manual solo como fallback", () => {
    expect(purchaseExpenseAmount({ isRental: false, quantity: 10, averageCost: 400 })).toBe(4000);
    // Renta con costo: el gasto es lo pagado, NO el valor actual (apreciado).
    expect(
      purchaseExpenseAmount({
        isRental: true,
        quantity: 1,
        averageCost: 50000000,
        currentValueManual: 85000000,
      }),
    ).toBe(50000000);
    // Renta sin costo ingresado: cae al valor manual.
    expect(
      purchaseExpenseAmount({
        isRental: true,
        quantity: 1,
        averageCost: 0,
        currentValueManual: 85000000,
      }),
    ).toBe(85000000);
  });

  it("edit de posición: solo el aumento explícito genera gasto (Fase 4.1)", () => {
    // Aporte: 8 → 10 uds a $400 = $800 de gasto.
    expect(
      positionIncreaseAmount({ isRental: false, oldQuantity: 8, newQuantity: 10, averageCost: 400 }),
    ).toBe(800);
    // Corrección a la baja o sin cambio: cero gasto.
    expect(
      positionIncreaseAmount({ isRental: false, oldQuantity: 10, newQuantity: 8, averageCost: 400 }),
    ).toBe(0);
    expect(
      positionIncreaseAmount({ isRental: false, oldQuantity: 10, newQuantity: 10, averageCost: 400 }),
    ).toBe(0);
    // Activo de renta: delta del valor manual.
    expect(
      positionIncreaseAmount({
        isRental: true,
        oldQuantity: 1,
        newQuantity: 1,
        averageCost: 0,
        oldManualValue: 80000000,
        newManualValue: 85000000,
      }),
    ).toBe(5000000);
  });

  it("retiro de meta con nota la incluye en la descripción", () => {
    const txn = goalWithdrawalToTxn({
      goalId: "77777777-7777-7777-7777-777777777777",
      goalName: "Fondo de emergencia",
      currency: "CRC",
      withdrawalDate: "2026-06-15",
      amount: 30000,
      note: "imprevisto médico",
    });
    expect(txn.description).toBe("Retiro — Fondo de emergencia · imprevisto médico");
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

  it("Fase 6.1: Zod rechaza uuid malformado y kind sin id antes de tocar la base", () => {
    const base = { kind: "gasto", amount: 1000, currency: "CRC", occurredOn: "2026-06-10" };
    // uuid malformado
    expect(
      txnInputSchema.safeParse({ ...base, linkedKind: "debt", linkedId: "no-es-uuid" }).success,
    ).toBe(false);
    // kind sin id (un kind colgante no es vínculo)
    expect(
      txnInputSchema.safeParse({ ...base, linkedKind: "debt", linkedId: null }).success,
    ).toBe(false);
    // 'none' con id null sigue siendo válido (caso del composer)
    expect(
      txnInputSchema.safeParse({ ...base, linkedKind: "none", linkedId: null }).success,
    ).toBe(true);
  });
});
