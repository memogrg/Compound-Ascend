/**
 * Saldo de deuda VIGENTE canónico. `currentDebtBalance` es la ÚNICA aritmética
 * que usan Deudas (`getDebtsOverview`), Patrimonio (`aggregateNetWorth`) y las
 * fichas para responder "cuánto debo". `debts.balance` es el ANCLA de alta
 * (inmutable — la RPC `record_debt_payment` no lo toca); el vigente es esa ancla
 * replayada por los pagos.
 *
 * El simulador cazó el bug que motiva esto: Patrimonio leía el ancla CRUDA, así
 * que pagar una deuda bajaba el patrimonio neto (debía quedar plano) y el pasivo
 * no coincidía con Deudas. Al enrutar todos por esta función, el número es uno
 * solo por construcción. La igualdad end-to-end entre consumidores (todos con la
 * misma BD) la verifica la rebanada vertical del sim; acá se fija el contrato de
 * la aritmética compartida.
 */
import { describe, it, expect } from "vitest";
import { currentDebtBalance } from "@/modules/control";
import type { Debt } from "@/modules/control/types";

const deuda = (over: Partial<Debt> = {}): Debt => ({
  id: "d1",
  name: "Tarjeta de crédito",
  balance: 350_000, // ancla de alta
  minPayment: 15_000,
  currentPayment: 15_000,
  apr: 0,
  currency: "CRC",
  isCurrent: true,
  ...over,
});

const pago = (paymentDate: string, amount: number) => ({
  paymentDate,
  amount,
  extraAmount: 0,
  kind: "ordinario" as const,
});

describe("currentDebtBalance · saldo vigente canónico", () => {
  it("sin pagos devuelve el ancla (no inventa nada)", () => {
    expect(currentDebtBalance(deuda(), [], 0)).toBe(350_000);
  });

  it("con apr=0, el vigente = ancla − pago (el escenario que cazó el simulador)", () => {
    // ancla 350.000, pago 30.000 → 320.000: el MISMO número que muestra Deudas, y
    // que ahora resta también Patrimonio (antes usaba 350.000 → neto 30.000 más bajo).
    expect(currentDebtBalance(deuda(), [pago("2026-01-20", 30_000)], 0)).toBe(320_000);
  });

  it("con apr=0, varios pagos restan su total al ancla", () => {
    const pagos = [pago("2026-01-10", 20_000), pago("2026-02-10", 25_000)];
    expect(currentDebtBalance(deuda(), pagos, 0)).toBe(305_000);
  });

  it("el saldo nunca baja de cero por más que se pague de más", () => {
    expect(currentDebtBalance(deuda(), [pago("2026-01-20", 999_999_999)], 0)).toBe(0);
  });

  it("respeta la aritmética de amortización cuando hay interés (apr>0)", () => {
    // interés del primer mes = 350.000 × 12%/12 = 3.500 → capital = 30.000 − 3.500
    // → saldo 323.500. Delega en recomputeFromPayments; no es resta pelada.
    expect(currentDebtBalance(deuda(), [pago("2026-02-01", 30_000)], 12)).toBe(323_500);
  });
});
