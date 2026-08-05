/**
 * Saldo de una deuda: la LISTA y el DETALLE tienen que dar el mismo número.
 *
 * Antes no lo daban. `debts.balance` es el saldo con el que se dio de alta la deuda y solo se
 * toca al editarla o al abonar en modo 'cuota'; el detalle, en cambio, lo recalcula desde los
 * pagos reportados —que son la fuente de la verdad— con `recomputeFromPayments`. Resultado: pagar
 * la cuota bajaba el saldo en el detalle y dejaba la lista congelada, y la simulación de
 * estrategia partía de un número viejo.
 *
 * La lista ahora usa esa MISMA función, así que los dos coinciden por construcción y no por
 * disciplina. Estos tests fijan el contrato de la función compartida y las dos trampas que tiene.
 */
import { describe, it, expect } from "vitest";
import { recomputeFromPayments, type AmortizationInput } from "@/modules/control/engine/amortization";

const deuda = (over: Partial<AmortizationInput> = {}): AmortizationInput => ({
  balance: 1_000_000,
  apr: 24,
  termMonths: 24,
  monthlyPayment: 60_000,
  insurance: 0,
  extraMonthly: 0,
  startDate: "2026-01-01",
  originalAmount: null,
  ...over,
});

const pago = (paymentDate: string, amount: number, extraAmount = 0, kind = "ordinario") => ({
  paymentDate,
  amount,
  extraAmount,
  kind: kind as "ordinario" | "extraordinario",
});

describe("saldo derivado de los pagos", () => {
  it("sin pagos, el saldo es el guardado (la lista no inventa nada)", () => {
    const r = recomputeFromPayments(deuda(), []);
    expect(r.currentBalance).toBe(1_000_000);
  });

  it("una cuota baja el saldo por su parte de CAPITAL, no por el total pagado", () => {
    // interés del primer mes = 1.000.000 × 24%/12 = 20.000 → capital = 60.000 − 20.000 = 40.000
    const r = recomputeFromPayments(deuda(), [pago("2026-02-01", 60_000)]);
    expect(r.currentBalance).toBe(960_000);
    expect(r.paidInterest).toBe(20_000);
    expect(r.paidPrincipal).toBe(40_000);
  });

  it("el abono extra va entero a capital, encima de la cuota", () => {
    const r = recomputeFromPayments(deuda(), [pago("2026-02-01", 60_000, 100_000)]);
    // 40.000 de capital de la cuota + 100.000 de abono
    expect(r.currentBalance).toBe(860_000);
  });

  it("un pago extraordinario no acumula interés del periodo", () => {
    const r = recomputeFromPayments(deuda(), [pago("2026-02-01", 100_000, 0, "extraordinario")]);
    expect(r.currentBalance).toBe(900_000);
    expect(r.paidInterest).toBe(0);
  });

  it("varios pagos se aplican en orden de fecha, no en el que lleguen", () => {
    const desordenados = [pago("2026-03-01", 60_000), pago("2026-02-01", 60_000)];
    const ordenados = [pago("2026-02-01", 60_000), pago("2026-03-01", 60_000)];
    expect(recomputeFromPayments(deuda(), desordenados).currentBalance).toBe(
      recomputeFromPayments(deuda(), ordenados).currentBalance,
    );
  });

  it("el saldo nunca baja de cero por más que se pague de más", () => {
    const r = recomputeFromPayments(deuda(), [pago("2026-02-01", 60_000, 5_000_000)]);
    expect(r.currentBalance).toBe(0);
  });

  /**
   * La trampa que hay que conocer. Con `originalAmount`, el replay arranca del monto original y
   * el resultado es el saldo real. SIN él, arranca del saldo GUARDADO y le resta los pagos —
   * así que si ese guardado ya era "el saldo de hoy", los pagos históricos se descuentan otra
   * vez. No es algo que introduzca la lista: es cómo el detalle viene calculando desde siempre, y
   * ahora los dos comparten el mismo comportamiento en vez de discrepar.
   */
  it("con originalAmount el replay parte del monto original", () => {
    const r = recomputeFromPayments(deuda({ originalAmount: 1_200_000 }), [
      pago("2026-02-01", 60_000),
    ]);
    // interés = 1.200.000 × 2% = 24.000 → capital 36.000 → 1.164.000
    expect(r.currentBalance).toBe(1_164_000);
  });

  it("el progreso se mide contra el original cuando existe", () => {
    const r = recomputeFromPayments(deuda({ originalAmount: 1_000_000 }), [
      pago("2026-02-01", 60_000),
    ]);
    expect(r.progressPct).toBeCloseTo(0.04, 4); // 40.000 de capital sobre 1.000.000
  });

  /**
   * Se corre en la moneda NATIVA de la deuda y se convierte después. La aritmética es lineal en
   * el saldo (interés = saldo·r; capital = cuota − interés + extra), así que convertir antes o
   * después da lo mismo — esto lo fija para que un refactor no lo rompa sin que nadie se entere.
   */
  it("convertir antes o después de derivar da el mismo saldo", () => {
    const TC = 500; // CRC por USD
    const enUSD = recomputeFromPayments(deuda(), [pago("2026-02-01", 60_000)]).currentBalance;
    const enCRC = recomputeFromPayments(
      deuda({ balance: 1_000_000 * TC, monthlyPayment: 60_000 * TC }),
      [pago("2026-02-01", 60_000 * TC)],
    ).currentBalance;
    expect(enCRC).toBeCloseTo(enUSD * TC, 6);
  });
});
